// Where the builders put what they build — and where instancing happens.
//
// A builder describes ONE thing in that thing's own frame (a chair, an arrangement's heads, a
// candlestick) and says where it stands. The collector places it: a one-off becomes a body with
// one instance; anything that asks to be INSTANCED (`InstanceRequest`, by key) is merged with
// every other request of the same key in the room — all the chiavari chairs in ivory, all the rose
// heads in blush — into one BodyNode with many instances, which the viewer draws as one instanced
// mesh. No builder needs to know what else is in the room, and no viewer needs to group anything.
//
// Transforms compose through ./frame.ts: a request's `at` is in the frame of the item it belongs
// to, the item's `at` in the room (or a table's frame, composed by the caller) — the SVG nesting,
// in data.
import { applyTransform, compose } from "./frame";
import { type BodyNode, type EmitterNode, type LabelNode, type MaterialRef, type NodeTag, type Part, type SceneNode, type Transform, type Vec3 } from "./types";

/** "Draw this geometry here, and share it with everything else that asks with the same key." */
export interface InstanceRequest {
  /** Everything that must be equal for two requests to share a geometry: kind, style, size,
   *  colour — e.g. `chair:chiavari:#f7f6fc:420x340x900`. */
  key: string;
  parts: Part[];
  material: MaterialRef;
  tag: NodeTag;
  lod?: BodyNode["lod"];
  castShadow?: boolean;
  /** In the frame of the item (or table, or stage) the request belongs to. */
  at: Transform;
}

export interface EmitterRequest {
  /** In the item's frame. */
  at: Vec3;
  radiusMm: number;
  colour: string;
  strength: number;
}

/** What an item builder returns: the item's own one-off parts (in the item's frame), the parts it
 *  wants instanced across the room, and what glows. */
export interface ItemBuild {
  parts: Part[];
  material: MaterialRef;
  instanced: InstanceRequest[];
  emitters: EmitterRequest[];
}

export const emptyBuild = (material: MaterialRef): ItemBuild => ({ parts: [], material, instanced: [], emitters: [] });

export class SceneCollector {
  private readonly oneOffs: BodyNode[] = [];
  private readonly shared = new Map<string, BodyNode>();
  private readonly emitters: EmitterNode[] = [];
  private readonly labels: LabelNode[] = [];
  private n = 0;

  /** A one-off body at one or many transforms (a wall, a table top, a stage deck). */
  body(id: string, tag: NodeTag, material: MaterialRef, parts: Part[], instances: Transform[], extra?: Partial<Pick<BodyNode, "lod" | "castShadow">>): void {
    if (!parts.length || !instances.length) return;
    this.oneOffs.push({ kind: "body", id, parts, material, instances, tag, ...extra });
  }

  /** A shared geometry placed at `at` (composed with `outer` when the request lives in a nested
   *  frame): merged with every other request of the same key. */
  instance(req: InstanceRequest, outer?: Transform): void {
    if (!req.parts.length) return;
    const at = outer ? compose(outer, req.at) : req.at;
    const have = this.shared.get(req.key);
    if (have) {
      have.instances.push(at);
      return;
    }
    const node: BodyNode = { kind: "body", id: `i:${req.key}`, parts: req.parts, material: req.material, instances: [at], tag: req.tag };
    if (req.lod) node.lod = req.lod;
    if (req.castShadow !== undefined) node.castShadow = req.castShadow;
    this.shared.set(req.key, node);
  }

  emit(e: EmitterRequest, outer?: Transform): void {
    const at = outer ? applyTransform(outer, e.at) : e.at;
    this.emitters.push({ kind: "emitter", id: `e:${this.n++}`, at, radiusMm: e.radiusMm, colour: e.colour, strength: e.strength });
  }

  label(id: string, at: Vec3, text: string): void {
    this.labels.push({ kind: "label", id, at, text });
  }

  /** Place a whole `ItemBuild` at `at`: its own parts as one body there, its instanced parts
   *  merged by key, its emitters carried into the room. */
  item(id: string, tag: NodeTag, build: ItemBuild, at: Transform, extra?: Partial<Pick<BodyNode, "lod" | "castShadow">>): void {
    this.body(id, tag, build.material, build.parts, [at], extra);
    for (const req of build.instanced) this.instance(req, at);
    for (const e of build.emitters) this.emit(e, at);
  }

  nodes(): SceneNode[] {
    return [...this.oneOffs, ...this.shared.values(), ...this.emitters, ...this.labels];
  }

  stats(): { bodies: number; instances: number; emitters: number } {
    let instances = 0;
    for (const b of this.oneOffs) instances += b.instances.length;
    for (const b of this.shared.values()) instances += b.instances.length;
    return { bodies: this.oneOffs.length + this.shared.size, instances, emitters: this.emitters.length };
  }
}
