// src/tools/notes/index.js
const listNotes = require('./listNotes');
const writeNote = require('./writeNote');
const appendNote = require('./appendNote');
const readNote = require('./readNote');
const deleteNote = require('./deleteNote');
const renameNote = require('./renameNote');

module.exports = { listNotes, writeNote, appendNote, readNote, deleteNote, renameNote };