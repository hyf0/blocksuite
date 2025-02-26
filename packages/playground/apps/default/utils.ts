import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { EditorContainer } from '@blocksuite/editor';
import { assertExists } from '@blocksuite/global/utils';
import type { BlobStorage, Page, Y } from '@blocksuite/store';
import {
  createIndexeddbStorage,
  Generator,
  Schema,
  Utils,
  Workspace,
  type WorkspaceOptions,
} from '@blocksuite/store';
import { fileOpen } from 'browser-fs-access';

import { getPlaygroundPresets } from './preset.js';
import { INDEXED_DB_NAME } from './providers/indexeddb-provider.js';

export const params = new URLSearchParams(location.search);
export const defaultMode = params.get('mode') === 'page' ? 'page' : 'edgeless';

const featureArgs = (params.get('features') ?? '').split(',');

export function getOptions(
  fn: (params: URLSearchParams) => Record<string, string | number>
) {
  return fn(params);
}

declare global {
  // eslint-disable-next-line no-var
  var targetPageId: string | undefined;
  // eslint-disable-next-line no-var
  var debugWorkspace: Workspace | undefined;
}

Object.defineProperty(globalThis, 'openFromFile', {
  value: async function importFromFile(pageId?: string) {
    const file = await fileOpen({
      extensions: ['.ydoc'],
    });
    const buffer = await file.arrayBuffer();
    if (pageId) {
      globalThis.targetPageId = pageId;
    }
    Workspace.Y.applyUpdate(window.workspace.doc, new Uint8Array(buffer));
  },
});

Object.defineProperty(globalThis, 'rebuildPageTree', {
  value: async function rebuildPageTree(doc: Y.Doc, pages: string[]) {
    const pageTree = doc
      .getMap<Y.Array<Y.Map<unknown>>>('space:meta')
      .get('pages');
    if (pageTree) {
      const pageIds = pageTree.map(p => p.get('id') as string).filter(v => v);
      for (const page of pages) {
        if (!pageIds.includes(page)) {
          const map = new Workspace.Y.Map([
            ['id', page],
            ['title', ''],
            ['createDate', +new Date()],
            ['subpageIds', []],
          ]);
          pageTree.push([map]);
        }
      }
    }
  },
});

Object.defineProperty(globalThis, 'debugFromFile', {
  value: async function debuggerFromFile() {
    const file = await fileOpen({
      extensions: ['.ydoc'],
    });
    const buffer = await file.arrayBuffer();
    const schema = new Schema();
    schema.register(AffineSchemas).register(__unstableSchemas);
    const workspace = new Workspace({
      schema,
      id: 'temporary',
    });
    Workspace.Y.applyUpdate(workspace.doc, new Uint8Array(buffer));
    globalThis.debugWorkspace = workspace;
  },
});

export const isBase64 =
  /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)?$/;

async function initWithMarkdownContent(
  workspace: Workspace,
  url: URL,
  pageId: string
) {
  const { edgelessEmpty: emptyInit } = await import('./presets/index.js');

  emptyInit(workspace, pageId);
  const page = workspace.getPage(pageId);
  assertExists(page);
  assertExists(page.root);
  const content = await fetch(url).then(res => res.text());
  const contentParser = new window.ContentParser(page);
  return contentParser.importMarkdown(content, page.root.id);
}

export async function tryInitExternalContent(
  workspace: Workspace,
  initParam: string,
  pageId: string
) {
  if (isValidUrl(initParam)) {
    const url = new URL(initParam);
    await initWithMarkdownContent(workspace, url, pageId);
  } else if (isBase64.test(initParam)) {
    Utils.applyYjsUpdateV2(workspace, initParam);
  }
}

/**
 * Provider configuration is specified by `?providers=broadcast` or `?providers=indexeddb,broadcast` in URL params.
 * We use BroadcastChannelProvider by default if the `providers` param is missing.
 */
export function createWorkspaceOptions(): WorkspaceOptions {
  const blobStorages: ((id: string) => BlobStorage)[] = [
    createIndexeddbStorage,
  ];
  const idGenerator: Generator = Generator.NanoID;
  const schema = new Schema();
  schema.register(AffineSchemas).register(__unstableSchemas);

  return {
    id: 'quickEdgeless',
    schema,
    providerCreators: [],
    idGenerator,
    blobStorages,
    defaultFlags: {
      enable_toggle_block: featureArgs.includes('toggle'),
      enable_set_remote_flag: true,
      enable_block_hub: true,
      enable_bookmark_operation: true,
      enable_note_index: true,
      enable_bultin_ledits: true,
      readonly: {
        'page:home': false,
      },
    },
  };
}

export function isValidUrl(urlLike: string) {
  let url;
  try {
    url = new URL(urlLike);
  } catch (_) {
    return false;
  }
  return url.protocol === 'http:' || url.protocol === 'https:';
}

export async function testIDBExistence() {
  return new Promise<boolean>(resolve => {
    const request = indexedDB.open(INDEXED_DB_NAME);
    request.onupgradeneeded = function () {
      request.transaction?.abort();
      request.result.close();
      resolve(false);
    };
    request.onsuccess = function () {
      request.result.close();
      resolve(true);
    };
  });
}

export const createEditor = (page: Page, element: HTMLElement) => {
  const presets = getPlaygroundPresets();

  const editor = new EditorContainer();
  editor.pagePreset = presets.pageModePreset;
  editor.edgelessPreset = presets.edgelessModePreset;
  editor.page = page;
  editor.slots.pageLinkClicked.on(({ pageId }) => {
    const target = page.workspace.getPage(pageId);
    if (!target) {
      throw new Error(`Failed to jump to page ${pageId}`);
    }
    editor.page = target;
  });

  element.append(editor);

  editor.createBlockHub().then(blockHub => {
    document.body.appendChild(blockHub);
  });
  return editor;
};
