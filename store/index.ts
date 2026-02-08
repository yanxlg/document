import { createSignal } from 'ranuts/utils';

export const [getDocmentObj, setDocmentObj] = createSignal<{
  fileName: string;
  file?: File;
  url?: string | URL;
}>({
  fileName: '',
  file: undefined,
  url: undefined,
});

// Preview mode state
let _previewMode = false;

export function setPreviewMode(value: boolean): void {
  _previewMode = value;
}

export function isPreviewMode(): boolean {
  return _previewMode;
}
