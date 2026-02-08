import { getAllQueryString } from 'ranuts/utils';
import { initEvents, setEventUICallbacks } from './lib/events';
import { onCreateNew, openDocumentFromUrl, setUICallbacks } from './lib/document';
import {
  createControlPanel,
  createFixedActionButton,
  hideControlPanel,
  showControlPanel,
  showMenuGuide,
} from './lib/ui';
import { setPreviewMode } from './store';
import 'ranui/button';
import './styles/base.css';

declare global {
  interface Window {
    onCreateNew: (ext: string) => Promise<void>;
    hideControlPanel?: () => void;
    showControlPanel?: () => void;
    DocsAPI: {
      DocEditor: new (elementId: string, config: any) => any;
    };
  }
}

// Check for mode parameter in URL
// ?mode=preview enables read-only preview mode (no toolbar, no editing, no UI controls)
const { file, src, mode } = getAllQueryString();
const preview = mode === 'preview';
if (preview) {
  setPreviewMode(true);
}

// Initialize events
initEvents();

// Set up UI callbacks to avoid circular dependency
setUICallbacks({
  hideControlPanel,
  showControlPanel,
  showMenuGuide,
});

// Set up UI callbacks for events module
setEventUICallbacks({
  hideControlPanel,
  showMenuGuide,
});

// Export onCreateNew to window
window.onCreateNew = onCreateNew;

// Export control panel functions for use in other modules
window.hideControlPanel = hideControlPanel;
window.showControlPanel = showControlPanel;

// Only create UI controls in non-preview mode
if (!preview) {
  createFixedActionButton();
  createControlPanel();
}

// Check for file or src parameter in URL
// Both parameters support opening document from URL
// Priority: file > src (for backward compatibility)
// Examples:
//   ?file=https://example.com/doc.docx
//   ?src=https://example.com/doc.docx
//   ?file=doc1.docx&src=doc2.xlsx (will use file: doc1.docx)
const documentUrl = file || src;
if (documentUrl) {
  // Decode URL if it's encoded
  try {
    const decodedUrl = decodeURIComponent(documentUrl);
    // Open document from URL
    openDocumentFromUrl(decodedUrl);
  } catch (error) {
    // If decoding fails, try using original URL
    console.warn('Failed to decode URL, using original:', error);
    openDocumentFromUrl(documentUrl);
  }
}
