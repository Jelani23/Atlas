// src/tools/files/index.js
const findFile = require('./findFile');
const fileExists = require('./fileExists');
const getFileMetadata = require('./getFileMetadata');
const getFileHash = require('./getFileHash');
const getChangedFiles = require('./getChangedFiles');
const readCode = require('./readCode');
const searchCode = require('./searchCode');
const listCode = require('./listCode');
const getDirectoryTree = require('./getDirectoryTree');
const readCodeDirectory = require('./readCodeDirectory');
const writeProposal = require('./writeProposal');

module.exports = {
    findFile, fileExists, getFileMetadata, getFileHash, getChangedFiles,
    readCode, searchCode, listCode, getDirectoryTree, readCodeDirectory, writeProposal
};