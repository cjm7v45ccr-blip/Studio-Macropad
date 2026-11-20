import { ActionBinding } from '../types/studio';

export const BERTOPAD_ACTION_MIME = 'application/x-bertopad-action';

export interface DraggedActionPayload {
  label: string;
  binding: ActionBinding;
}

// In-memory mirror so dragover handlers (which cannot read dataTransfer.getData
// in most browsers) can still render live target-slot previews.
let activeDraggedAction: DraggedActionPayload | null = null;

export function setActiveDraggedAction(payload: DraggedActionPayload | null): void {
  activeDraggedAction = payload;
}

export function getActiveDraggedAction(): DraggedActionPayload | null {
  return activeDraggedAction;
}

export function hasDraggedAction(dt: DataTransfer | null | undefined): boolean {
  if (activeDraggedAction) return true;
  if (!dt) return false;
  return Array.from(dt.types || []).includes(BERTOPAD_ACTION_MIME);
}

export function writeActionDragData(
  dt: DataTransfer,
  payload: DraggedActionPayload
): void {
  activeDraggedAction = payload;
  dt.effectAllowed = 'copy';
  try {
    dt.setData(BERTOPAD_ACTION_MIME, JSON.stringify(payload));
    dt.setData('text/plain', payload.label);
  } catch {
    // Ignore restricted DataTransfer environments
  }
}

export function readActionDragData(
  dt: DataTransfer | null | undefined
): DraggedActionPayload | null {
  if (dt) {
    try {
      const raw = dt.getData(BERTOPAD_ACTION_MIME);
      if (raw) {
        const parsed = JSON.parse(raw) as DraggedActionPayload;
        if (parsed && parsed.binding && typeof parsed.binding.value === 'string') {
          return parsed;
        }
      }
    } catch {
      // Fall back to in-memory mirror
    }
  }
  return activeDraggedAction;
}
