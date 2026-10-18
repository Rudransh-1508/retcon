import {
  AmbientLight, BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, DirectionalLight, DoubleSide, EdgesGeometry,
  Group, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  OctahedronGeometry, PerspectiveCamera, PlaneGeometry, Quaternion, Raycaster, Scene, SphereGeometry, Vector2, Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { GraphData, GraphEdge, GraphNode } from '../api'
import { LEVELS, layout, levelOf } from './layout'

export type Palette = {
  ink: string; paper: string; panel: string; line: string; muted: string; held: string; retract: string
  u0: string; u1: string; u2: string; u3: string
}

export type Picked = { id: string; kind: string; label: string; status: string; extra: string | null }
export type SceneEvents = {
  onPick: (node: Picked | null) => void
  onHover: (node: (Picked & { x: number; y: number; width: number }) | null) => void
  onError: (message: string) => void
}

type NodeState = 'held' | 'retracted' | 'rippling'
const GAP = 8
const RADIUS = 20
const HOME_CAMERA = new Vector3(54, 36, 62)
const HOME_TARGET = new Vector3(0, GAP * 2, 0)

const ease = (t: number) => 1 - Math.pow(1 - t, 3)
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const KIND_GEOMETRY: Record<string, () => BufferGeometry> = {
  Advisory: () => new SphereGeometry(0.3, 16, 12),
  Exposure: () => new BoxGeometry(0.5, 0.5, 0.5),
  Judgment: () => new OctahedronGeometry(0.55),
  Decision: () => new CylinderGeometry(0.62, 0.62, 0.34, 6),
  Plan: () => new BoxGeometry(0.7, 0.16, 0.5),
}

/**
 * A graph of beliefs drawn as stacked plates, one per kind. Orbit with the pointer, hover or tap a belief to
 * inspect it, and replay a retraction wave by wave. All state that React cares about leaves through `events`.
 */
export class GraphScene {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(38, 1, 0.1, 400)
  private controls: OrbitControls
  private raycaster = new Raycaster()
  private pointer = new Vector2()
  private root = new Group()
  private meshes = new Map<string, InstancedMesh>()
  private plates: Mesh[] = []
  private lines: LineSegments
  private lineColors: Float32Array
  private focus = new Set<string>()

  private nodes: GraphNode[]
  private index = new Map<string, { kind: string; slot: number; i: number }>()
  private position: Vector3[]
  private state: NodeState[]
  private ripple = new Map<number, number>() // node index -> start time
  private edgeState: NodeState[]
  private edgeEnds: [string, string][]
  private edgeLong: boolean[]
  private showLong = false
  private edgeStatus: NodeState[]
  private edgeRipple = new Map<number, number>()
  private edgesBySupport = new Map<string, number[]>()
  private slots = new Map<string, number[]>() // kind -> node indices in instance order
  private colors: { held: Color; retract: Color; line: Color; muted: Color; ink: Color; dim: Color }
  private decisionColor: Color[] = []

  private dirty = true
  private frame = 0
  private disposed = false
  private hoverId: string | null = null
  private selectedId: string | null = null
  private flight: { from: Vector3; to: Vector3; fromTarget: Vector3; toTarget: Vector3; start: number; ms: number } | null = null
  private readonly reduceMotion: boolean
  private observer: ResizeObserver
  private io: IntersectionObserver
  private visible = true
  private tmp = new Matrix4()
  private q = new Quaternion()
  private scaleV = new Vector3()

  /** Builds a scene, or reports through `events.onError` and returns null when WebGL cannot start. */
  static create(host: HTMLElement, data: GraphData, palette: Palette, events: SceneEvents, autoRotate: boolean): GraphScene | null {
    try {
      return new GraphScene(host, data, palette, events, autoRotate)
    } catch (e) {
      events.onError(e instanceof Error ? e.message : 'The 3D scene could not be created.')
      return null
    }
  }

  private constructor(private host: HTMLElement, data: GraphData, palette: Palette, private events: SceneEvents, autoRotate = true) {
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none'
    this.renderer.domElement.tabIndex = 0
    host.appendChild(this.renderer.domElement)

    this.colors = {
      held: new Color(palette.held), retract: new Color(palette.retract), line: new Color(palette.line),
      muted: new Color(palette.muted), ink: new Color(palette.ink), dim: new Color(palette.line).lerp(new Color(palette.muted), 0.35),
    }
    this.decisionColor = [palette.u0, palette.u1, palette.u2, palette.u3].map((c) => new Color(c))

    this.nodes = data.nodes
    const placed = layout(data, RADIUS)
    this.position = this.nodes.map((n) => {
      const p = placed.get(n.id) ?? { x: 0, z: 0 }
      return new Vector3(p.x, levelOf(n.kind) * GAP, p.z)
    })
    this.state = this.nodes.map((n) => (n.status === 'retracted' ? 'retracted' : 'held'))

    this.scene.add(this.root)
    this.scene.add(new AmbientLight(0xffffff, 1.7))
    const sun = new DirectionalLight(0xffffff, 2.2)
    sun.position.set(-8, 24, 14)
    this.scene.add(sun)

    this.buildPlates(palette)
    this.buildNodes()
    const built = this.buildEdges(data.edges)
    this.lines = built.lines
    this.lineColors = built.colors
    this.root.add(this.lines)
    this.edgeEnds = data.edges.map((e) => [e.source, e.target])
    const kindOf = new Map(this.nodes.map((n) => [n.id, n.kind]))
    this.edgeLong = data.edges.map((e) => Math.abs(levelOf(kindOf.get(e.source) ?? '') - levelOf(kindOf.get(e.target) ?? '')) >= 2)
    this.edgeStatus = data.edges.map((e) => (e.status === 'retracted' ? 'retracted' : 'held'))
    this.edgeState = [...this.edgeStatus]
    this.recolorAll()

    this.camera.position.copy(HOME_CAMERA)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 10
    this.controls.maxDistance = 140
    this.controls.maxPolarAngle = Math.PI * 0.62
    this.controls.target.copy(HOME_TARGET)
    this.controls.autoRotate = autoRotate && !this.reduceMotion
    this.controls.autoRotateSpeed = 0.35
    this.controls.addEventListener('change', () => { this.dirty = true })
    this.controls.addEventListener('start', () => { this.controls.autoRotate = false; this.flight = null; this.hoverId = null; this.events.onHover(null) })

    const el = this.renderer.domElement
    el.addEventListener('pointermove', this.onMove)
    el.addEventListener('pointerleave', this.onLeave)
    el.addEventListener('click', this.onClick)
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(host)
    this.io = new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; this.dirty = true })
    this.io.observe(host)
    this.resize()
    this.events.onPick(null)
    this.events.onHover(null)
    this.loop()
  }

  // ---- construction -------------------------------------------------------------------------------------------

  private buildPlates(p: Palette) {
    const size = RADIUS * 2 + 3
    const fill = new MeshBasicMaterial({ color: new Color(p.panel), transparent: true, opacity: 0.34, side: DoubleSide, depthWrite: false })
    const edge = new LineBasicMaterial({ color: new Color(p.line), transparent: true, opacity: 0.95 })
    for (let i = 0; i < LEVELS.length; i++) {
      const g = new PlaneGeometry(size, size)
      const plate = new Mesh(g, fill)
      plate.rotation.x = -Math.PI / 2
      plate.position.y = i * GAP - 0.02
      plate.renderOrder = -1
      const outline = new LineSegments(new EdgesGeometry(g), edge)
      plate.add(outline)
      this.root.add(plate)
      this.plates.push(plate)
    }
  }

  private buildNodes() {
    const byKind = new Map<string, number[]>()
    this.nodes.forEach((n, i) => byKind.set(n.kind, [...(byKind.get(n.kind) ?? []), i]))
    for (const [kind, list] of byKind) {
      const material = new MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 })
      const mesh = new InstancedMesh((KIND_GEOMETRY[kind] ?? KIND_GEOMETRY.Advisory)(), material, list.length)
      mesh.userData.kind = kind
      list.forEach((nodeIndex, slot) => {
        this.index.set(this.nodes[nodeIndex].id, { kind, slot, i: nodeIndex })
        mesh.setColorAt(slot, this.colors.held)
      })
      this.slots.set(kind, list)
      this.meshes.set(kind, mesh)
      this.root.add(mesh)
    }
  }

  private buildEdges(edges: GraphEdge[]) {
    const positions = new Float32Array(edges.length * 6)
    const colors = new Float32Array(edges.length * 8)
    edges.forEach((e, k) => {
      const a = this.index.get(e.source)
      const b = this.index.get(e.target)
      if (a && b) {
        const pa = this.position[a.i]
        const pb = this.position[b.i]
        positions.set([pa.x, pa.y, pa.z, pb.x, pb.y, pb.z], k * 6)
      }
      if (e.support) this.edgesBySupport.set(e.support, [...(this.edgesBySupport.get(e.support) ?? []), k])
    })
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    geometry.setAttribute('color', new BufferAttribute(colors, 4))
    const lines = new LineSegments(geometry, new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }))
    return { lines, colors }
  }

  // ---- state and colour ---------------------------------------------------------------------------------------

  private nodeColor(i: number, out: Color) {
    const n = this.nodes[i]
    const s = this.state[i]
    const faded = this.focus.size > 0 && !this.focus.has(n.id)
    if (s === 'rippling') out.copy(this.colors.retract)
    else if (s === 'retracted') out.copy(this.colors.dim)
    else if (n.kind === 'Decision') out.copy(this.decisionColor[Math.min(3, Number(String(n.extra ?? 'P3').slice(1)) || 3)])
    else if (n.kind === 'Plan') out.copy(this.colors.muted)
    else if (n.kind === 'Advisory') out.copy(this.colors.ink).lerp(this.colors.held, 0.25)
    else out.copy(this.colors.held)
    if (faded) out.lerp(this.colors.line, 0.82)
    if (n.id === this.hoverId || n.id === this.selectedId) out.lerp(this.colors.ink, 0.35)
  }

  private placeNode(i: number, scale = 1) {
    const n = this.nodes[i]
    const info = this.index.get(n.id)
    const mesh = info && this.meshes.get(info.kind)
    if (!info || !mesh) return
    const base = n.kind === 'Decision' ? 1.15 : 1
    this.scaleV.setScalar(base * scale * (this.state[i] === 'retracted' ? 0.8 : 1))
    this.tmp.compose(this.position[i], this.q, this.scaleV)
    mesh.setMatrixAt(info.slot, this.tmp)
  }

  private recolorAll() {
    const c = new Color()
    for (let i = 0; i < this.nodes.length; i++) {
      const info = this.index.get(this.nodes[i].id)
      const mesh = info && this.meshes.get(info.kind)
      if (!info || !mesh) continue
      this.nodeColor(i, c)
      mesh.setColorAt(info.slot, c)
      this.placeNode(i)
    }
    for (const mesh of this.meshes.values()) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    this.recolorEdges()
    this.dirty = true
  }

  private recolorEdges() {
    const edges = this.lines.geometry.getAttribute('color') as BufferAttribute
    const c = new Color()
    const ends = this.edgeEnds
    for (let k = 0; k < this.edgeState.length; k++) {
      const s = this.edgeState[k]
      const lit = this.focus.size > 0 && this.focus.has(ends[k][0]) && this.focus.has(ends[k][1])
      if (s === 'rippling') c.copy(this.colors.retract)
      else if (s === 'retracted') c.copy(this.colors.retract)
      else c.copy(this.colors.held)
      // Edges that skip a plate would bury the picture; they only show for a selection or a replay.
      let alpha = this.edgeLong[k] ? (this.showLong ? 0.16 : 0) : s === 'retracted' ? 0.5 : 0.42
      if (this.focus.size > 0) alpha = lit ? 0.95 : this.edgeLong[k] ? 0 : 0.05
      if (s === 'rippling') alpha = 1
      this.lineColors.set([c.r, c.g, c.b, alpha, c.r, c.g, c.b, alpha], k * 8)
    }
    edges.needsUpdate = true
  }

  // ---- picking ------------------------------------------------------------------------------------------------

  /** Where a belief is on screen, in canvas pixels. Used by the end-to-end checks. */
  screenPosition(id: string): { x: number; y: number } | null {
    const i = this.index.get(id)?.i
    if (i === undefined) return null
    const v = this.position[i].clone().project(this.camera)
    const r = this.renderer.domElement.getBoundingClientRect()
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
  }

  private pick(e: PointerEvent | MouseEvent): { node: GraphNode; x: number; y: number; width: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    let best: { node: GraphNode; d: number } | null = null
    for (const [kind, mesh] of this.meshes) {
      const hit = this.raycaster.intersectObject(mesh, false)[0]
      if (hit && hit.instanceId !== undefined && (!best || hit.distance < best.d)) {
        best = { node: this.nodes[this.slots.get(kind)![hit.instanceId]], d: hit.distance }
      }
    }
    return best ? { node: best.node, x: e.clientX - rect.left, y: e.clientY - rect.top, width: rect.width } : null
  }

  private onMove = (e: PointerEvent) => {
    if (e.buttons) return
    const hit = this.pick(e)
    const id = hit?.node.id ?? null
    if (id !== this.hoverId) {
      this.hoverId = id
      this.renderer.domElement.style.cursor = id ? 'pointer' : 'grab'
      this.recolorAll()
    }
    this.events.onHover(hit ? { ...toPicked(hit.node), x: hit.x, y: hit.y, width: hit.width } : null)
  }

  private onLeave = () => {
    if (this.hoverId) { this.hoverId = null; this.recolorAll() }
    this.events.onHover(null)
  }

  private onClick = (e: MouseEvent) => {
    const hit = this.pick(e)
    this.select(hit?.node.id ?? null)
  }

  /** Select a belief: everything it rests on or supports stays lit, the rest fades back. */
  select(id: string | null) {
    this.selectedId = id
    this.focus.clear()
    if (id) {
      const seen = new Set<string>([id])
      const walk = (start: string, dir: 0 | 1) => {
        const queue = [start]
        while (queue.length) {
          const cur = queue.pop()!
          for (const [a, b] of this.edgeEnds) {
            const [from, to] = dir === 0 ? [b, a] : [a, b]
            if (from === cur && !seen.has(to)) { seen.add(to); queue.push(to) }
          }
        }
      }
      walk(id, 0)
      walk(id, 1)
      seen.forEach((s) => this.focus.add(s))
    }
    this.recolorAll()
    const n = id ? this.nodes[this.index.get(id)?.i ?? -1] : undefined
    this.events.onPick(n ? toPicked(n) : null)
  }

  /** The given beliefs plus everything within `hops` edges of them, so a replay is framed with its context. */
  private withNeighbours(start: number[], hops: number): number[] {
    const seen = new Set(start)
    let frontier = start
    for (let h = 0; h < hops; h++) {
      const next: number[] = []
      for (const [a, b] of this.edgeEnds) {
        const ia = this.index.get(a)?.i
        const ib = this.index.get(b)?.i
        if (ia === undefined || ib === undefined) continue
        if (frontier.includes(ia) && !seen.has(ib)) { seen.add(ib); next.push(ib) }
        if (frontier.includes(ib) && !seen.has(ia)) { seen.add(ia); next.push(ia) }
      }
      frontier = next
    }
    return [...seen]
  }

  // ---- camera -------------------------------------------------------------------------------------------------

  private flyTo(points: Vector3[], padding = 1.5) {
    if (!points.length) return
    const center = new Vector3()
    points.forEach((p) => center.add(p))
    center.divideScalar(points.length)
    let radius = 3
    points.forEach((p) => { radius = Math.max(radius, p.distanceTo(center)) })
    const dir = this.camera.position.clone().sub(this.controls.target).normalize()
    const distance = Math.min(90, Math.max(30, (radius * padding) / Math.tan((this.camera.fov * Math.PI) / 360)))
    const to = center.clone().add(dir.multiplyScalar(distance))
    this.controls.autoRotate = false
    if (this.reduceMotion) {
      this.camera.position.copy(to)
      this.controls.target.copy(center)
      this.dirty = true
      return
    }
    this.flight = { from: this.camera.position.clone(), to, fromTarget: this.controls.target.clone(), toTarget: center, start: performance.now(), ms: 700 }
  }

  resetView() {
    this.select(null)
    this.controls.autoRotate = false
    if (this.reduceMotion) {
      this.camera.position.copy(HOME_CAMERA)
      this.controls.target.copy(HOME_TARGET)
      this.dirty = true
      return
    }
    this.flight = { from: this.camera.position.clone(), to: HOME_CAMERA.clone(), fromTarget: this.controls.target.clone(), toTarget: HOME_TARGET.clone(), start: performance.now(), ms: 700 }
  }

  /** Links that skip a plate are hidden until something is selected; this shows them faintly all the time. */
  setShowAllLinks(on: boolean) {
    this.showLong = on
    this.recolorEdges()
    this.dirty = true
  }

  setAutoRotate(on: boolean) {
    this.controls.autoRotate = on && !this.reduceMotion
    this.dirty = true
  }

  // ---- retraction replay --------------------------------------------------------------------------------------

  /**
   * Plays a retraction: each wave pulses magenta, then settles as retracted. A what-if passes `restore` so the
   * scene goes back to what the live graph holds, because nothing was written.
   */
  async playWaves(waves: string[][], restore: boolean, isCancelled: () => boolean) {
    const touchedNodes: number[] = []
    const touchedEdges: number[] = []
    for (const id of waves.flat()) {
      const info = this.index.get(id)
      if (info) touchedNodes.push(info.i)
      for (const k of this.edgesBySupport.get(id) ?? []) touchedEdges.push(k)
    }
    // Start from the "before": these beliefs are held until their wave arrives.
    for (const i of touchedNodes) this.state[i] = 'held'
    for (const k of touchedEdges) this.edgeState[k] = 'held'
    this.select(null)
    this.hoverId = null
    this.events.onHover(null)
    // Fade everything but the affected beliefs and what they touch, so the wave reads against a quiet graph.
    const context = this.withNeighbours(touchedNodes, 1)
    context.forEach((i) => this.focus.add(this.nodes[i].id))
    this.recolorAll()
    this.flyTo(context.map((i) => this.position[i]), 1.4)
    await wait(this.reduceMotion ? 100 : 800)

    for (const wave of waves) {
      if (isCancelled()) break
      const nodes: number[] = []
      const edges: number[] = []
      for (const id of wave) {
        const info = this.index.get(id)
        if (info) nodes.push(info.i)
        for (const k of this.edgesBySupport.get(id) ?? []) edges.push(k)
      }
      const now = performance.now()
      nodes.forEach((i) => { this.state[i] = 'rippling'; this.ripple.set(i, now) })
      edges.forEach((k) => { this.edgeState[k] = 'rippling'; this.edgeRipple.set(k, now) })
      this.recolorAll()
      await wait(this.reduceMotion ? 250 : 900)
      nodes.forEach((i) => { this.state[i] = 'retracted'; this.ripple.delete(i) })
      edges.forEach((k) => { this.edgeState[k] = 'retracted'; this.edgeRipple.delete(k) })
      this.recolorAll()
      await wait(this.reduceMotion ? 100 : 350)
    }

    await wait(this.reduceMotion ? 200 : 1200)
    this.focus.clear()
    if (restore) {
      this.nodes.forEach((n, i) => { this.state[i] = n.status === 'retracted' ? 'retracted' : 'held' })
      this.edgeState = this.edgeState.map((_, k) => this.edgeStatus[k])
      this.recolorAll()
    }
  }

  // ---- loop ---------------------------------------------------------------------------------------------------

  private resize() {
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.dirty = true
  }

  private loop = () => {
    if (this.disposed) return
    this.frame = requestAnimationFrame(this.loop)
    if (!this.visible || document.hidden) return
    const now = performance.now()

    if (this.flight) {
      const t = Math.min(1, (now - this.flight.start) / this.flight.ms)
      const k = ease(t)
      this.camera.position.lerpVectors(this.flight.from, this.flight.to, k)
      this.controls.target.lerpVectors(this.flight.fromTarget, this.flight.toTarget, k)
      if (t >= 1) this.flight = null
      this.dirty = true
    }

    if (this.ripple.size) {
      for (const [i, start] of this.ripple) {
        const t = Math.min(1, (now - start) / 900)
        this.placeNode(i, 1 + Math.sin(t * Math.PI) * 1.2)
      }
      for (const mesh of this.meshes.values()) mesh.instanceMatrix.needsUpdate = true
      this.dirty = true
    }

    const moved = this.controls.update()
    if (moved || this.dirty) {
      this.renderer.render(this.scene, this.camera)
      this.dirty = false
    }
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.observer.disconnect()
    this.io.disconnect()
    const el = this.renderer.domElement
    el.removeEventListener('pointermove', this.onMove)
    el.removeEventListener('pointerleave', this.onLeave)
    el.removeEventListener('click', this.onClick)
    this.controls.dispose()
    this.scene.traverse((o) => {
      const m = o as Mesh
      m.geometry?.dispose?.()
      const mat = m.material
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
      else mat?.dispose?.()
    })
    this.renderer.dispose()
    el.remove()
  }
}

function toPicked(n: GraphNode): Picked {
  return { id: n.id, kind: n.kind, label: n.label, status: n.status, extra: n.extra }
}
