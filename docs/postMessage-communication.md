# OnlyOffice PostMessage 通信协议文档

本项目存在两层 iframe 嵌套通信架构：

```
外部主页面  ←→  本项目 (iframe)  ←→  OnlyOffice 编辑器 (嵌套 iframe)
```

- **第一层**：外部主页面通过 `ranuts/utils` 的 `Platform` 模块与本项目通信
- **第二层**：本项目通过 `DocsAPI.DocEditor` API 与 OnlyOffice 编辑器 iframe 通信

---

## 一、外部主页面 ↔ 本项目

### 1.1 外部主页面 → 本项目（接收）

通过 `Platform.init(events)` 注册，定义在 `lib/events.ts`。

| type | 字段 | 类型 | 说明 |
|------|------|------|------|
| `RENDER_OFFICE` | `chunkIndex` | `number` | 当前分块索引 |
| | `data` | `string` | 分块数据（Base64） |
| | `lastModified` | `number` | 文件最后修改时间戳 |
| | `name` | `string` | 文件名 |
| | `size` | `number` | 文件总大小 |
| | `totalChunks` | `number` | 总分块数 |
| | `type` | `string` | 文件 MIME 类型 |
| `CLOSE_EDITOR` | 无 | - | 关闭并销毁编辑器实例 |
| `SET_PREVIEW_MODE` | `preview` | `boolean` | 设置预览模式（隐藏工具栏和操作按钮，禁止编辑） |

**处理逻辑**：
- `RENDER_OFFICE`：收集所有分块，收齐后通过 `MessageCodec.decodeFileChunked` 解码为 File，然后初始化 X2T 转换器并打开文档
- `CLOSE_EDITOR`：清空分块缓存，调用 `editor.destroyEditor()` 销毁编辑器，回传 `EDITOR_CLOSED`
- `SET_PREVIEW_MODE`：设置预览模式状态，隐藏 FAB 和控制面板

### 1.2 本项目 → 外部主页面（发送）

通过 `notifyParent()` 发送，内部使用 `MessageCodec.encode` 编码后 `window.parent.postMessage()` 发送。

所有消息统一使用 `{ type, payload }` 结构，经过 `MessageCodec.encode` 编码。

| type | payload 字段 | 类型 | 说明 |
|------|-------------|------|------|
| `DOCUMENT_READY` | `fileName` | `string` | 已加载的文件名 |
| | `fileType` | `string` | 文件类型（如 `docx`, `xlsx`, `pptx`） |
| `EDITOR_ERROR` | `error` | `string` | 错误信息 |
| | `fileName` | `string?` | 相关文件名（如有） |
| | `fileType` | `string?` | 相关文件类型（如有） |
| | `url` | `string?` | 相关 URL（如有） |
| `SAVE_RESULT` | `success` | `boolean` | 保存是否成功 |
| | `fileName` | `string` | 文件名 |
| | `format` | `string?` | 保存格式（成功时） |
| | `error` | `string?` | 错误信息（失败时） |
| `EDITOR_CLOSED` | — | — | 编辑器已关闭销毁 |

**触发时机**：
- `DOCUMENT_READY`：OnlyOffice 编辑器触发 `onDocumentReady` 事件后
- `EDITOR_ERROR`：编辑器创建失败、文档转换失败、RENDER_OFFICE 处理失败、URL 加载文档失败
- `SAVE_RESULT`：用户保存文档完成（成功或失败）
- `EDITOR_CLOSED`：收到 `CLOSE_EDITOR` 消息并销毁编辑器后

**消息格式**（所有消息经过 `MessageCodec.encode` 编码）：
```typescript
// 编码前的结构
{
  type: 'DOCUMENT_READY' | 'EDITOR_ERROR' | 'SAVE_RESULT' | 'EDITOR_CLOSED',
  payload: { ... }
}
```

**外部主页面监听示例**：
```javascript
import { MessageCodec } from 'ranuts/utils';

window.addEventListener('message', (event) => {
  if (typeof event.data !== 'string') return;
  const decoded = MessageCodec.decode(event.data);
  if (!decoded) return;

  switch (decoded.type) {
    case 'DOCUMENT_READY':
      console.log(`文档已就绪: ${decoded.payload.fileName} (${decoded.payload.fileType})`);
      break;
    case 'EDITOR_ERROR':
      console.error(`编辑器错误: ${decoded.payload.error}`);
      break;
    case 'SAVE_RESULT':
      if (decoded.payload.success) {
        console.log(`保存成功: ${decoded.payload.fileName}`);
      } else {
        console.error(`保存失败: ${decoded.payload.error}`);
      }
      break;
    case 'EDITOR_CLOSED':
      console.log('编辑器已关闭');
      break;
  }
});
```

---

## 二、本项目 ↔ OnlyOffice 编辑器 iframe

通过 `DocsAPI.DocEditor` 实例管理，定义在 `public/web-apps/apps/api/documents/api.js`。

### 2.1 本项目 → 编辑器（发送 command）

通过 `editor.sendCommand({ command, data })` 或 API 方法调用，最终走 `iframe.contentWindow.postMessage()`。

#### 本项目实际使用的 command

| command | data 字段 | 说明 |
|---------|-----------|------|
| `asc_openDocument` | `{ buf: ArrayBuffer }` | 加载文档二进制内容 |
| `asc_setImageUrls` | `{ urls: Record<string, string> }` | 设置图片资源映射 |
| `asc_writeFileCallback` | `{ path: string, imgName: string }` | 图片写入成功回调 |
| `asc_writeFileCallback` | `{ success: false, error: string }` | 图片写入失败回调 |
| `asc_onSaveCallback` | `{ err_code: number }` | 保存完成通知（0=成功） |

#### API 层支持的全部 command

| command | data 字段 | 说明 |
|---------|-----------|------|
| `init` | `{ config: EditorConfig }` | 初始化编辑器配置 |
| `openDocument` | `{ doc: DocumentConfig }` | 打开文档 |
| `processSaveResult` | `{ result: boolean, message: string }` | 处理保存结果 |
| `processRightsChange` | `{ enabled: boolean, message: string }` | 编辑权限变更 |
| `applyEditRights` | `{ allowed: boolean, message: string }` | 应用编辑权限 |
| `refreshHistory` | `{ data: any, message: string }` | 刷新历史记录 |
| `setHistoryData` | `{ data: any, message: string }` | 设置历史版本数据 |
| `setEmailAddresses` | `{ data: any }` | 设置邮箱地址列表 |
| `setActionLink` | `{ url: string }` | 设置操作链接 |
| `processMailMerge` | `{ enabled: boolean, message: string }` | 处理邮件合并 |
| `downloadAs` | 自定义 | 下载为指定格式 |
| `internalCommand` | `{ command: string, data: any }` | 内部命令 |
| `setUsers` | 自定义 | 设置用户列表 |
| `showSharingSettings` | 自定义 | 显示共享设置 |
| `setSharingSettings` | 自定义 | 设置共享配置 |
| `insertImage` | 自定义 | 插入图片 |
| `setMailMergeRecipients` | 自定义 | 设置邮件合并收件人 |
| `setRevisedFile` | 自定义 | 设置修订文件 |
| `setFavorite` | 自定义 | 设置收藏 |
| `requestClose` | 自定义 | 请求关闭编辑器 |
| `grabFocus` | 自定义 | 获取焦点（延迟 10ms） |
| `blurFocus` | 自定义 | 失去焦点 |
| `setReferenceData` | 自定义 | 设置引用数据 |
| `setRequestedDocument` | 自定义 | 设置请求的文档 |
| `setRequestedSpreadsheet` | 自定义 | 设置请求的电子表格 |
| `setReferenceSource` | 自定义 | 设置引用源 |
| `showMessage` | `{ msg: string }` | 显示消息对话框 |
| `processMouse` | `{ type: string, x: number, y: number, event: MouseEvent }` | 转发鼠标事件 |
| `resetFocus` | `{}` | 移动端重置焦点 |

### 2.2 编辑器 → 本项目（接收 event）

编辑器通过 `window.parent.postMessage()` 发送，本项目通过 `MessageDispatcher` 监听。

**消息格式**：
```typescript
{
  frameEditorId: string,  // 编辑器实例 ID
  event: string,          // 事件名
  data: any               // 事件数据
}
```

#### 本项目已注册的 event

| event | data 类型 | 说明 |
|-------|-----------|------|
| `onAppReady` | 无 | 编辑器就绪，触发 `asc_setImageUrls` + `asc_openDocument` |
| `onDocumentReady` | 无 | 文档加载完成，向外部主页面发送 `DOCUMENT_READY` |
| `onSave` | `SaveEvent` | 保存文档，触发格式转换和下载，向外部主页面发送 `SAVE_RESULT` |
| `writeFile` | `{ data: Uint8Array, file: string, _target: any }` | 粘贴外部图片时写入文件 |

**SaveEvent 结构**：
```typescript
interface SaveEvent {
  data: {
    data: {
      data: Uint8Array;  // 文档二进制数据
    };
    option: {
      outputformat: number;  // 输出格式编号
    };
  };
}
```

#### API 层支持但未注册的 event（可扩展）

| event | 说明 |
|-------|------|
| `onDocumentStateChange` | 文档修改状态变更 |
| `onOutdatedVersion` | 文档版本过期 |
| `onMetaChange` | 文档元数据变更 |
| `onCollaborativeChanges` | 协作变更 |
| `onRequestEditRights` | 请求编辑权限 |
| `onRequestRename` | 请求重命名 |
| `onRequestClose` | 请求关闭 |
| `onRequestHistory` | 请求历史记录 |
| `onRequestHistoryData` | 请求历史版本数据 |
| `onRequestHistoryClose` | 请求关闭历史视图 |
| `onRequestRestore` | 请求恢复版本 |
| `onDownloadAs` | 下载为其他格式 |
| `onRequestSaveAs` | 请求另存为 |
| `onRequestOpenFile` | 请求打开文件 |
| `onRequestInsertImage` | 请求插入图片 |
| `onRequestCompareFile` | 请求比较文件 |
| `onRequestCreateNew` | 请求新建文档 |
| `onRequestReferenceData` | 请求引用数据 |
| `onRequestOpen` | 请求打开 |
| `onRequestSelectDocument` | 请求选择文档 |
| `onRequestSelectSpreadsheet` | 请求选择电子表格 |
| `onRequestReferenceSource` | 请求引用源 |
| `onRequestEmailAddresses` | 请求邮箱地址 |
| `onRequestUsers` | 请求用户列表 |
| `onRequestSendNotify` | 请求发送通知 |
| `onRequestMailMergeRecipients` | 请求邮件合并收件人 |
| `onRequestSharingSettings` | 请求共享设置 |
| `onMakeActionLink` | 请求生成操作链接 |
| `onRequestFeedback` | 请求反馈 |
| `onError` | 错误 |
| `onWarning` | 警告 |
| `onInfo` | 信息 |
| `onExternalPluginMessage` | 外部插件消息 |
| `onExternalPluginMessageCallback` | 外部插件消息回调 |

---

## 三、消息流向图

```
外部主页面                      本项目 (iframe)                   OnlyOffice 编辑器 (嵌套 iframe)
    │                                │                                    │
    │── RENDER_OFFICE ──────────────>│                                    │
    │── CLOSE_EDITOR ───────────────>│                                    │
    │── SET_PREVIEW_MODE ───────────>│                                    │
    │   (via Platform/ranuts)        │                                    │
    │                                │── init ───────────────────────────>│
    │                                │── openDocument ───────────────────>│
    │                                │── asc_openDocument ──────────────>│
    │                                │── asc_setImageUrls ──────────────>│
    │                                │── asc_onSaveCallback ────────────>│
    │                                │── asc_writeFileCallback ─────────>│
    │                                │                                    │
    │                                │<── onAppReady ─────────────────────│
    │                                │<── onDocumentReady ────────────────│
    │<── DOCUMENT_READY ─────────────│    (触发回传)                       │
    │   (MessageCodec.encode)        │                                    │
    │                                │<── onSave ────────────────────────│
    │<── SAVE_RESULT ────────────────│    (触发回传)                       │
    │                                │<── writeFile ─────────────────────│
    │                                │                                    │
    │<── EDITOR_ERROR ───────────────│    (任何错误场景)                    │
    │<── EDITOR_CLOSED ──────────────│    (编辑器销毁后)                    │
```

---

## 四、editor.sendCommand 接口

`window.editor.sendCommand` 是本项目与 OnlyOffice 编辑器通信的核心方法：

```typescript
window.editor?.sendCommand({
  command: string,
  data: {
    err_code?: number;
    urls?: Record<string, string>;
    path?: string;
    imgName?: string;
    buf?: ArrayBuffer;
    success?: boolean;
    error?: string;
  }
});
```

---

## 五、安全说明

- 所有 `postMessage` 调用均使用 `'*'` 作为 targetOrigin
- 编辑器接收端通过 `frameOrigin === event.origin` 进行来源校验
- `frameEditorId` 用于多编辑器实例路由
- 消息中包含 `event` 字段时会被 JSON 序列化
