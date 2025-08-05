import {
  $view,
  $command,
  $inputRule,
  $nodeSchema,
  $remark,
  $ctx,
} from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import { InputRule } from '@milkdown/kit/prose/inputrules'
import { setBlockType } from '@milkdown/kit/prose/commands'
import type { DefineFeature } from '../shared'
import { crepeFeatureConfig } from '../../core/slice'
import { CrepeFeature } from '..'
import directive from 'remark-directive'

// File Upload Block Configuration
export interface FileUploadBlockConfig {
  onUpload: (file: File) => Promise<string>
  uploadButton?: string
  uploadPlaceholderText?: string
  confirmButton?: string
  fileIcon?: string
  acceptedFormats?: string[]
  maxFileSize?: number // in bytes
  defaultWidth?: string
  defaultHeight?: string
}

// Schema ID
export const fileUploadBlockId = 'fileUploadBlock'

// Node Schema
export const fileUploadBlockSchema = $nodeSchema(fileUploadBlockId, () => ({
  group: 'block',
  atom: true,
  isolating: true,
  marks: '',
  attrs: {
    src: { default: null },
    fileName: { default: null },
    fileType: { default: null },
    width: { default: '100%' },
    height: { default: '600px' },
    uploading: { default: false },
    error: { default: null },
  },
  parseDOM: [
    {
      tag: 'div[data-file-upload-block]',
      getAttrs: (dom) => {
        const el = dom as HTMLElement
        return {
          src: el.getAttribute('data-src'),
          fileName: el.getAttribute('data-filename'),
          fileType: el.getAttribute('data-filetype'),
          width: el.getAttribute('data-width') || '100%',
          height: el.getAttribute('data-height') || '600px',
        }
      },
    },
  ],
  toDOM: (node) => {
    return [
      'div',
      {
        'data-file-upload-block': '',
        'data-src': node.attrs.src,
        'data-filename': node.attrs.fileName,
        'data-filetype': node.attrs.fileType,
        'data-width': node.attrs.width,
        'data-height': node.attrs.height,
        class: 'file-upload-block',
      },
      ['iframe', {
        src: node.attrs.src,
        width: node.attrs.width,
        height: node.attrs.height,
        frameborder: '0',
        style: 'border: 1px solid #e5e7eb; border-radius: 8px;',
      }],
    ]
  },
  parseMarkdown: {
    match: (node) => node.type === 'leafDirective' && node.name === 'file',
    runner: (state, node, type) => {
      const attrs = node.attributes as Record<string, string>
      state.addNode(type, {
        src: attrs.src,
        fileName: attrs.fileName,
        fileType: attrs.fileType,
        width: attrs.width || '100%',
        height: attrs.height || '600px',
      })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === fileUploadBlockId,
    runner: (state, node) => {
      state.addNode('leafDirective', undefined, undefined, {
        name: 'file',
        attributes: {
          src: node.attrs.src,
          fileName: node.attrs.fileName,
          fileType: node.attrs.fileType,
          width: node.attrs.width,
          height: node.attrs.height,
        },
      })
    },
  },
}))

// Input Rule for triggering file upload
export const fileUploadInputRule = $inputRule(
  (ctx) =>
    new InputRule(/::file$/, (state, match, start, end) => {
      const { tr } = state
      tr.replaceWith(
        start - 1,
        end,
        fileUploadBlockSchema.type(ctx).create({ uploading: true })
      )
      return tr
    })
)

// Command to insert file upload block
export const insertFileUploadBlockCommand = $command(
  'insertFileUploadBlock',
  (ctx) => () => (state, dispatch) => {
    const { tr } = state
    const { $from } = tr.selection
    const node = fileUploadBlockSchema.type(ctx).create({ uploading: true })

    if (dispatch) {
      tr.replaceSelectionWith(node)
      dispatch(tr)
    }

    return true
  }
)

// Plugin Key for File Upload
const fileUploadPluginKey = new PluginKey('fileUploadPlugin')

// File Upload Component View
class FileUploadView {
  dom: HTMLElement
  config: FileUploadBlockConfig

  constructor(
    private ctx: any,
    private node: any,
    private view: any,
    private getPos: () => number,
    config: FileUploadBlockConfig
  ) {
    this.config = config
    this.dom = this.createDOM()
    this.update(node)
  }

  createDOM(): HTMLElement {
    const container = document.createElement('div')
    container.className = 'file-upload-container'
    container.style.cssText = `
      border: 2px dashed #e5e7eb;
      border-radius: 8px;
      padding: 24px;
      text-align: center;
      margin: 16px 0;
      background: #f9fafb;
      min-height: 200px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    `

    if (this.node.attrs.uploading) {
      this.renderUploadUI(container)
    } else if (this.node.attrs.error) {
      this.renderError(container)
    } else if (this.node.attrs.src) {
      this.renderIframe(container)
    }

    return container
  }

  renderUploadUI(container: HTMLElement) {
    // File icon
    const icon = document.createElement('div')
    icon.innerHTML = this.config.fileIcon || '📄'
    icon.style.fontSize = '48px'
    icon.style.marginBottom = '16px'

    // Upload button
    const uploadBtn = document.createElement('button')
    uploadBtn.textContent = this.config.uploadButton || 'Choose File'
    uploadBtn.style.cssText = `
      background: #3b82f6;
      color: white;
      padding: 8px 16px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-size: 14px;
      margin-bottom: 12px;
    `

    // Hidden file input
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = this.config.acceptedFormats?.join(',') || '*'
    fileInput.style.display = 'none'

    // Placeholder text
    const placeholder = document.createElement('p')
    placeholder.textContent = this.config.uploadPlaceholderText || 'or drag and drop a file here'
    placeholder.style.cssText = 'color: #6b7280; font-size: 14px; margin: 0;'

    // Event handlers
    uploadBtn.onclick = () => fileInput.click()

    fileInput.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        await this.handleFileUpload(file)
      }
    }

    // Drag and drop
    container.ondragover = (e) => {
      e.preventDefault()
      container.style.borderColor = '#3b82f6'
      container.style.background = '#eff6ff'
    }

    container.ondragleave = () => {
      container.style.borderColor = '#e5e7eb'
      container.style.background = '#f9fafb'
    }

    container.ondrop = async (e) => {
      e.preventDefault()
      container.style.borderColor = '#e5e7eb'
      container.style.background = '#f9fafb'

      const file = e.dataTransfer?.files[0]
      if (file) {
        await this.handleFileUpload(file)
      }
    }

    container.appendChild(icon)
    container.appendChild(uploadBtn)
    container.appendChild(fileInput)
    container.appendChild(placeholder)
  }

  renderError(container: HTMLElement) {
    container.style.borderColor = '#ef4444'
    container.style.background = '#fee'

    const errorMsg = document.createElement('p')
    errorMsg.textContent = `Error: ${this.node.attrs.error}`
    errorMsg.style.cssText = 'color: #ef4444; margin: 0;'

    const retryBtn = document.createElement('button')
    retryBtn.textContent = 'Try Again'
    retryBtn.style.cssText = `
      background: #ef4444;
      color: white;
      padding: 8px 16px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-size: 14px;
      margin-top: 12px;
    `

    retryBtn.onclick = () => {
      this.updateNode({ uploading: true, error: null })
    }

    container.appendChild(errorMsg)
    container.appendChild(retryBtn)
  }

  renderIframe(container: HTMLElement) {
    container.style.border = 'none'
    container.style.padding = '0'
    container.style.background = 'none'
    container.style.minHeight = 'auto'

    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'position: relative; width: 100%;'

    // File info bar
    const infoBar = document.createElement('div')
    infoBar.style.cssText = `
      background: #f3f4f6;
      padding: 8px 12px;
      border-radius: 6px 6px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 14px;
    `

    const fileName = document.createElement('span')
    fileName.textContent = this.node.attrs.fileName || 'Uploaded File'
    fileName.style.color = '#374151'

    const removeBtn = document.createElement('button')
    removeBtn.textContent = '✕'
    removeBtn.style.cssText = `
      background: none;
      border: none;
      cursor: pointer;
      font-size: 16px;
      color: #6b7280;
      padding: 4px 8px;
    `

    removeBtn.onclick = () => {
      const pos = this.getPos()
      const tr = this.view.state.tr.delete(pos, pos + this.node.nodeSize)
      this.view.dispatch(tr)
    }

    infoBar.appendChild(fileName)
    infoBar.appendChild(removeBtn)

    // Iframe
    const iframe = document.createElement('iframe')
    iframe.src = this.node.attrs.src
    iframe.width = this.node.attrs.width
    iframe.height = this.node.attrs.height
    iframe.frameBorder = '0'
    iframe.style.cssText = `
      width: ${this.node.attrs.width};
      height: ${this.node.attrs.height};
      border: 1px solid #e5e7eb;
      border-radius: 0 0 6px 6px;
      display: block;
    `

    wrapper.appendChild(infoBar)
    wrapper.appendChild(iframe)
    container.appendChild(wrapper)
  }

  async handleFileUpload(file: File) {
    // Check file size
    if (this.config.maxFileSize && file.size > this.config.maxFileSize) {
      this.updateNode({
        uploading: false,
        error: `File size exceeds ${(this.config.maxFileSize / 1024 / 1024).toFixed(2)}MB limit`,
      })
      return
    }

    // Show loading state
    this.dom.innerHTML = ''
    const loading = document.createElement('div')
    loading.style.cssText = 'color: #6b7280; font-size: 14px;'
    loading.textContent = 'Uploading...'
    this.dom.appendChild(loading)

    try {
      const url = await this.config.onUpload(file)
      this.updateNode({
        src: url,
        fileName: file.name,
        fileType: file.type,
        uploading: false,
        error: null,
        width: this.config.defaultWidth || '100%',
        height: this.config.defaultHeight || '600px',
      })
    } catch (error) {
      this.updateNode({
        uploading: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      })
    }
  }

  updateNode(attrs: Record<string, any>) {
    const pos = this.getPos()
    const tr = this.view.state.tr.setNodeMarkup(
      pos,
      null,
      { ...this.node.attrs, ...attrs }
    )
    this.view.dispatch(tr)
  }

  update(node: any) {
    if (node.type !== this.node.type) return false
    this.node = node
    this.dom.innerHTML = ''

    if (node.attrs.uploading) {
      this.renderUploadUI(this.dom)
    } else if (node.attrs.error) {
      this.renderError(this.dom)
    } else if (node.attrs.src) {
      this.renderIframe(this.dom)
    }

    return true
  }

  destroy() {
    this.dom.remove()
  }
}

// File Upload Plugin
export const fileUploadPlugin = $view(
  fileUploadPluginKey,
  (ctx) => (view, config: FileUploadBlockConfig) => {
    return new Plugin({
      key: fileUploadPluginKey,
      props: {
        nodeViews: {
          [fileUploadBlockId]: (node, view, getPos) => {
            return new FileUploadView(ctx, node, view, getPos as () => number, config)
          },
        },
      },
    })
  }
)

// Remark Directive Plugin
const remarkDirective = $remark('fileUploadBlock', () => directive)

// Main Feature Definition
export const fileUploadBlock: DefineFeature<FileUploadBlockConfig> = (
  editor,
  config = {}
) => {
  const defaultConfig: FileUploadBlockConfig = {
    onUpload: async (file) => {
      // Default implementation - should be overridden
      throw new Error('onUpload function not provided')
    },
    uploadButton: 'Choose File',
    uploadPlaceholderText: 'or drag and drop a file here',
    confirmButton: 'Confirm',
    fileIcon: '📄',
    acceptedFormats: [],
    maxFileSize: 10 * 1024 * 1024, // 10MB default
    defaultWidth: '100%',
    defaultHeight: '600px',
    ...config,
  }

  editor
    .config(crepeFeatureConfig(CrepeFeature.Scorm))
    .config((ctx) => {
      ctx.set(fileUploadPlugin.key, defaultConfig)
    })
    .use(remarkDirective)
    .use(fileUploadBlockSchema)
    .use(fileUploadInputRule)
    .use(insertFileUploadBlockCommand)
    .use(fileUploadPlugin)
}
