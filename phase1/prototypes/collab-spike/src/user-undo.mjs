import * as Y from 'yjs'
/** Track only this person's explicit editor transactions, never remote sync. */
export class UserUndo {
  constructor(files, canEdit = () => true) {
    this.origin = Object.freeze({ kind: 'local-user-edit' })
    this.doc = files.doc
    this.canEdit = canEdit
    this.manager = new Y.UndoManager(files, { trackedOrigins: new Set([this.origin]), captureTimeout: 0 })
  }
  transact(edit) {
    if (!this.canEdit()) throw new Error('Editing is not allowed for this role')
    this.doc.transact(edit, this.origin)
  }
  undo() { if (!this.canEdit()) throw new Error('Editing is not allowed for this role'); return this.manager.undo() }
  redo() { if (!this.canEdit()) throw new Error('Editing is not allowed for this role'); return this.manager.redo() }
  destroy() { this.manager.destroy() }
}
