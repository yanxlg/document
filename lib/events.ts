import { MessageCodec, Platform, createObjectURL } from 'ranuts/utils';
import type { MessageHandler } from 'ranuts/utils';
import { getDocmentObj, setDocmentObj, setPreviewMode } from '../store';
import { handleDocumentOperation, initX2T } from './converter';
import { showLoading } from './loading';
import { notifyParent } from './onlyoffice-editor';

// UI callbacks to avoid circular dependency
let hideControlPanelFn: (() => void) | null = null;
let showMenuGuideFn: (() => void) | null = null;

export function setEventUICallbacks(callbacks: { hideControlPanel: () => void; showMenuGuide: () => void }): void {
  hideControlPanelFn = callbacks.hideControlPanel;
  showMenuGuideFn = callbacks.showMenuGuide;
}

export interface RenderOfficeData {
  chunkIndex: number;
  data: string;
  lastModified: number;
  name: string;
  size: number;
  totalChunks: number;
  type: string;
}

let fileChunks: RenderOfficeData[] = [];

export const events: Record<string, MessageHandler<any, unknown>> = {
  SET_PREVIEW_MODE: (data: { preview: boolean }) => {
    setPreviewMode(!!data?.preview);
    // Hide FAB and control panel in preview mode
    if (data?.preview) {
      const fabContainer = document.querySelector('#fab-container') as HTMLElement;
      const controlPanel = document.querySelector('#control-panel-container') as HTMLElement;
      if (fabContainer) fabContainer.style.display = 'none';
      if (controlPanel) controlPanel.style.display = 'none';
    }
  },
  RENDER_OFFICE: async (data: RenderOfficeData) => {
    // Hide the control panel when rendering office
    if (hideControlPanelFn) {
      hideControlPanelFn();
    }
    fileChunks.push(data);
    if (fileChunks.length >= data.totalChunks) {
      const { removeLoading } = showLoading();
      try {
        const file = await MessageCodec.decodeFileChunked(fileChunks);
        setDocmentObj({
          fileName: file.name,
          file: file,
          url: await createObjectURL(file),
        });
        await initX2T();
        const { fileName, file: fileBlob } = getDocmentObj();
        await handleDocumentOperation({ file: fileBlob, fileName, isNew: !fileBlob });
        // Show menu guide after document is loaded
        if (showMenuGuideFn) {
          setTimeout(() => {
            showMenuGuideFn!();
          }, 1000);
        }
      } catch (error) {
        console.error('Error rendering office document:', error);
        notifyParent('EDITOR_ERROR', {
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        fileChunks = [];
        // Always remove loading, even if there's an error
        removeLoading();
      }
    }
  },
  CLOSE_EDITOR: () => {
    fileChunks = [];
    if (window.editor && typeof window.editor.destroyEditor === 'function') {
      window.editor.destroyEditor();
    }
    notifyParent('EDITOR_CLOSED', {});
  },
};

export function initEvents(): void {
  Platform.init(events);
}
