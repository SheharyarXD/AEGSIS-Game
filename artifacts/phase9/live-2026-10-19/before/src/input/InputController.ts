import { Vector2 } from 'three';

const BLOCKED_KEYS = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
]);

export class InputController {
  private readonly held = new Set<string>();
  private readonly tapped = new Set<string>();
  private readonly lookDelta = new Vector2();
  private enabled = true;
  public locked = false;

  constructor(private readonly pointerTarget: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    pointerTarget.addEventListener('mousedown', this.requestPointerLock);
    window.addEventListener('blur', this.clear);
    document.addEventListener('pointerlockchange', this.onLock);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    pointerTarget.addEventListener('contextmenu', this.preventMenu);
  }

  public isHeld(code: string): boolean {
    return this.enabled && this.held.has(code);
  }

  public consumeTap(code: string): boolean {
    if (!this.enabled || !this.tapped.has(code)) return false;
    this.tapped.delete(code);
    return true;
  }

  /** Any of several bindings held. */
  public anyHeld(codes: string[]): boolean { return codes.some(code => this.isHeld(code)); }
  /** Any of several bindings tapped (all of them are consumed). */
  public anyTap(codes: string[]): boolean { let tapped = false; for (const code of codes) if (this.consumeTap(code)) tapped = true; return tapped; }

  public consumeLook(): Vector2 {
    const delta = this.lookDelta.clone();
    this.lookDelta.set(0, 0);
    return delta;
  }

  public getMoveAxes(): Vector2 {
    if (!this.enabled) return new Vector2();
    return new Vector2(
      Number(this.held.has('KeyD')) - Number(this.held.has('KeyA')),
      Number(this.held.has('KeyW')) - Number(this.held.has('KeyS')),
    ).clampLength(0, 1);
  }

  public getVerticalAxis(): number {
    if (!this.enabled) return 0;
    return Number(this.held.has('Space')) - Number(this.held.has('ControlLeft') || this.held.has('ControlRight'));
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    this.pointerTarget.removeEventListener('mousedown', this.requestPointerLock);
    window.removeEventListener('blur', this.clear);
    document.removeEventListener('pointerlockchange', this.onLock);
    window.removeEventListener('mousedown',this.onMouseDown);
    window.removeEventListener('mouseup',this.onMouseUp);
    this.pointerTarget.removeEventListener('contextmenu',this.preventMenu);
  }

  public setEnabled(enabled:boolean):void {this.enabled=enabled;this.clear();}
  public endFrame():void {this.tapped.clear();}
  public reset():void {this.clear();}
  public async lock():Promise<void> {try {await this.pointerTarget.requestPointerLock();}catch { /* Keyboard + drag fallback remains available. */ }}
  private readonly onLock=():void=>{this.locked=document.pointerLockElement===this.pointerTarget;this.clear();};
  private readonly onMouseDown=(e:MouseEvent):void=>{if(e.target!==this.pointerTarget)return;this.held.add(`Mouse${e.button}`);if(this.locked)this.tapped.add(`Mouse${e.button}`);};
  private readonly onMouseUp=(e:MouseEvent):void=>{this.held.delete(`Mouse${e.button}`);};
  private readonly preventMenu=(e:Event):void=>e.preventDefault();

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if(event.target instanceof HTMLButtonElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement)return;
    if (BLOCKED_KEYS.has(event.code)) event.preventDefault();
    if (!event.repeat) this.tapped.add(event.code);
    this.held.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if ((!this.locked && !this.held.has('Mouse0')) || !this.enabled) return;
    this.lookDelta.x += event.movementX;
    this.lookDelta.y += event.movementY;
  };

  private readonly requestPointerLock = (): void => {
    if (document.pointerLockElement !== this.pointerTarget && this.enabled) void this.lock();
  };

  private readonly clear = (): void => {
    this.held.clear();
    this.tapped.clear();
    this.lookDelta.set(0, 0);
  };
}
