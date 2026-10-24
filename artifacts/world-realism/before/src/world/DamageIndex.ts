/** Dense triangle removal. Only deleted triangles and their swapped survivors are touched. */
export class DamageIndex<T extends Uint16Array|Uint32Array = Uint16Array|Uint32Array> {
  readonly order: Uint32Array;
  readonly slots: Uint32Array;
  count: number;
  private first = Infinity;
  private last = 0;
  constructor(readonly array: T, readonly ranges: Map<number, [number, number][]>) {
    this.count = array.length / 3;
    this.order = new Uint32Array(this.count);
    this.slots = new Uint32Array(this.count);
    for (let i = 0; i < this.count; i++) this.order[i] = this.slots[i] = i;
  }
  remove(component: number): void {
    for (const [start, length] of this.ranges.get(component) ?? []) {
      for (let source = start / 3; source < (start + length) / 3; source++) {
        const slot = this.slots[source];
        if (slot === 0xffffffff) continue;
        const tail = --this.count;
        if (slot !== tail) {
          const offset = slot * 3, end = tail * 3;
          this.array[offset] = this.array[end];
          this.array[offset + 1] = this.array[end + 1];
          this.array[offset + 2] = this.array[end + 2];
          const moved = this.order[tail];
          this.order[slot] = moved;
          this.slots[moved] = slot;
          this.first = Math.min(this.first, offset);
          this.last = Math.max(this.last, offset + 3);
        }
        this.slots[source] = 0xffffffff;
      }
    }
  }
  updates(): {start: number; count: number} | null {
    const result = this.first === Infinity ? null : {start: this.first, count: this.last - this.first};
    this.first = Infinity; this.last = 0;
    return result;
  }
}
