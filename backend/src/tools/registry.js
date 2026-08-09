// backend/src/tools/registry.js
const https = require('https');
const fs = require('fs');
const path = require('path');
const devState = require('../memory/devState');
const knowledgeLibrary = require('../memory/knowledgeLibrary');
const projectCache = require('../core/projectCache');

// Systemic fix: Establish BACKEND_ROOT relative to this file
const BACKEND_ROOT = path.join(__dirname, '../../');

// Helper to fetch raw data from a URL with a User-Agent (Kept for DuckDuckGo fallback)
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        if (!url.startsWith('http')) {
            url = 'https://' + url;
        }
        
        const parsedUrl = new URL(url);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
            }
        };

        https.get(options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let newUrl = res.headers.location;
                if (newUrl.startsWith('/')) newUrl = parsedUrl.origin + newUrl;
                return resolve(fetchUrl(newUrl));
            }
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

// Helper to clean HTML but preserve structure for the LLM (Kept for DuckDuckGo fallback)
function cleanHtmlForLLM(html) {
    return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<\/(li|tr|td|th|p|h1|h2|h3)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/ {2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

async function webSearch(query) {
    const apiKey = process.env.SERPER_API_KEY;

    // 1. Primary Search: Serper.dev (Fast, clean JSON, Google results)
    if (apiKey) {
        try {
            console.log(`[Tool] Querying Serper.dev for: ${query}`);
            const response = await fetch('https://google.serper.dev/search', {
                method: 'POST',
                headers: {
                    'X-API-KEY': apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ q: query })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.organic && data.organic.length > 0) {
                    const snippets = data.organic.slice(0, 3)
                        .map(r => r.snippet || r.title)
                        .filter(Boolean);
                    
                    if (snippets.length > 0) {
                        return snippets.join('\n\n');
                    }
                }
                console.log(`[Tool] Serper.dev returned no organic results. Falling back...`);
            } else {
                console.log(`[Tool] Serper.dev returned status: ${response.status}. Falling back...`);
            }
        } catch (e) {
            console.error(`[Tool] Serper.dev failed: ${e.message}. Falling back...`);
        }
    }

    // 2. Secondary Search: DuckDuckGo HTML Scraping
    console.log(`[Tool] Querying DuckDuckGo HTML for: ${query}`);
    const ddgResult = await new Promise(async (resolve) => {
        const encodedQuery = encodeURIComponent(query);
        try {
            const html = await fetchUrl(`https://html.duckduckgo.com/html/?q=${encodedQuery}`);
            const urlMatches = html.match(/uddg=([^&"]+)/g);
            
            if (urlMatches && urlMatches.length > 0) {
                let firstLink = decodeURIComponent(urlMatches[0].replace('uddg=', ''));
                console.log(`[Tool] Scraping first result: ${firstLink}`);
                
                await new Promise(r => setTimeout(r, 1000));
                const pageHtml = await fetchUrl(firstLink);
                const text = cleanHtmlForLLM(pageHtml);
                                
                if (text.length > 100) {
                    return resolve(text.substring(0, 2500));
                }
            }
            resolve(null); // Return null if DDG fails so we can trigger Wikipedia
        } catch (e) {
            console.error("[Tool] DuckDuckGo search error:", e.message);
            resolve(null); // Resolve null to trigger Wikipedia
        }
    });

    if (ddgResult) return ddgResult;

    // 3. Tertiary Search: Wikipedia API (Zero-setup, no key, bulletproof for entities)
    console.log(`[Tool] Falling back to Wikipedia API for: ${query}`);
    try {
        const wikiResponse = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}?redirect=true`);
        if (wikiResponse.ok) {
            const wikiData = await wikiResponse.json();
            if (wikiData.type === 'standard' && wikiData.extract) {
                return `Wikipedia Summary:\n${wikiData.extract}`;
            }
        }
    } catch (e) {
        console.error(`[Tool] Wikipedia API error: ${e.message}`);
    }

    return "No direct results found across all search providers.";
}

async function getTime() {
    const now = new Date();
    const localTime = now.toLocaleString('en-US', { timeZoneName: 'short' });
    const utcTime = now.toUTCString();
    return `Local System Time: ${localTime}\nUTC Time: ${utcTime}`;
}

async function convertTime(targetZone) {
    const now = new Date();
    const zoneMap = {
        'JST': 'Asia/Tokyo', 'EST': 'America/New_York', 'EDT': 'America/New_York',
        'CST': 'America/Chicago', 'CDT': 'America/Chicago', 'PST': 'America/Los_Angeles',
        'PDT': 'America/Los_Angeles', 'GMT': 'UTC', 'UTC': 'UTC'
    };

    const upperZone = targetZone.toUpperCase();
    const ianaZone = zoneMap[upperZone] || targetZone;

    try {
        const convertedTime = now.toLocaleString('en-US', { 
            timeZone: ianaZone, timeZoneName: 'short' 
        });
        return `The exact current time in ${upperZone} (${ianaZone}) is ${convertedTime}.`;
    } catch (e) {
        return `Could not convert to timezone ${targetZone}.`;
    }
}

async function calculate(expression) {
    try {
        const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
        if (!sanitized) return "Error: Invalid mathematical expression.";
        const result = new Function(`return ${sanitized}`)();
        return `The result of ${sanitized} is ${result}.`;
    } catch (error) {
        return `Error calculating: ${error.message}`;
    }
}

// --- FILE TOOLS ---

function sanitizeFilename(filename) {
    let name = String(filename || `atlas_note_${Date.now()}`);
    name = path.basename(name);
    name = name.replace(/\.txt$/i, '');
    name = name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!name) name = `atlas_note_${Date.now()}`;
    return `${name}.txt`;
}

async function listNotes() {
    try {
        const notesDir = path.join(BACKEND_ROOT, 'notes');
        if (!fs.existsSync(notesDir)) return "No notes directory found.";
        const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.txt'));
        if (files.length === 0) return "No notes found.";
        return `Available notes:\n${files.join('\n')}`;
    } catch (error) {
        return `Error listing notes: ${error.message}`;
    }
}

async function writeNote(filename, content) {
    try {
        const safeFilename = sanitizeFilename(filename);
        const notesDir = path.join(BACKEND_ROOT, 'notes');
        if (!fs.existsSync(notesDir)) fs.mkdirSync(notesDir);
        const filePath = path.join(notesDir, safeFilename);
        fs.writeFileSync(filePath, content, 'utf8');
        return `Successfully saved the note to notes/${safeFilename}.`;
    } catch (error) {
        return `Error saving note: ${error.message}`;
    }
}

async function appendNote(filename, content) {
    try {
        const safeFilename = sanitizeFilename(filename);
        const notesDir = path.join(BACKEND_ROOT, 'notes');
        const notesPath = path.join(notesDir, safeFilename);
        const rootPath = path.join(BACKEND_ROOT, safeFilename);
        let actualPath = fs.existsSync(notesPath) ? notesPath : (fs.existsSync(rootPath) ? rootPath : null);
        if (!actualPath) return `Error: Note ${safeFilename} not found.`;
        let currentContent = fs.readFileSync(actualPath, 'utf8');
        if (!currentContent.endsWith('\n')) currentContent += '\n';
        currentContent += content;
        fs.writeFileSync(actualPath, currentContent, 'utf8');
        return `Successfully updated the note ${safeFilename}.`;
    } catch (error) {
        return `Error updating note: ${error.message}`;
    }
}

async function readNote(filename) {
    try {
        const safeFilename = sanitizeFilename(filename);
        const notesDir = path.join(BACKEND_ROOT, 'notes');
        const notesPath = path.join(notesDir, safeFilename);
        const rootPath = path.join(BACKEND_ROOT, safeFilename);
        if (fs.existsSync(notesPath)) {
            let content = fs.readFileSync(notesPath, 'utf8');
            content = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `Content of ${safeFilename}:\n${content}`;
        } else if (fs.existsSync(rootPath)) {
            let content = fs.readFileSync(rootPath, 'utf8');
            content = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `Content of ${safeFilename}:\n${content}`;
        }
        return `Error: Note ${safeFilename} not found.`;
    } catch (error) {
        return `Error reading note: ${error.message}`;
    }
}

async function deleteNote(filename) {
    try {
        const safeFilename = sanitizeFilename(filename);
        const notesDir = path.join(BACKEND_ROOT, 'notes');
        const notesPath = path.join(notesDir, safeFilename);
        const rootPath = path.join(BACKEND_ROOT, safeFilename);
        let actualPath = fs.existsSync(notesPath) ? notesPath : (fs.existsSync(rootPath) ? rootPath : null);
        if (!actualPath) return `Error: Note ${safeFilename} not found.`;
        fs.unlinkSync(actualPath);
        return `Successfully deleted the note ${safeFilename}.`;
    } catch (error) {
        return `Error deleting note: ${error.message}`;
    }
}

// --- KNOWLEDGE TOOLS ---
async function searchKnowledge(query) {
    const results = await knowledgeLibrary.search(query);
    if (results.length === 0) return "No knowledge found for that query.";
    return results.map(r => `Subject: ${r.subject}\nKey: ${r.key}\nValue:\n${r.value}`).join('\n---\n');
}

async function updateDevState(feature, status) {
    try {
        const result = await devState.updateFeature(feature, status);
        if (result.updated) {
            return `Success: Updated existing feature "${result.feature}" to status "${result.status}".`;
        } else {
            return `Success: Added new feature "${result.feature}" with status "${result.status}".`;
        }
    } catch (error) {
        return `Error updating dev state: ${error.message}`;
    }
}

// Helper to recursively find a directory
function findDirectoryRecursive(dir, targetDirName) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        if (file.isDirectory()) {
            if (file.name === 'node_modules' || file.name === '.git') continue;
            const fullPath = path.join(dir, file.name);
            if (file.name.toLowerCase() === targetDirName.toLowerCase()) {
                return fullPath;
            }
            const found = findDirectoryRecursive(fullPath, targetDirName);
            if (found) return found;
        }
    }
    return null;
}

// Helper to recursively find a file using Fuzzy Matching
function findFileRecursive(dir, filename) {
    const normalize = (str) => str.toLowerCase().replace(/[\s_-]/g, '').replace(/\.\w+$/, '');
    const targetName = normalize(filename);

    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
            if (file.name === 'node_modules' || file.name === '.git') continue; 
            const found = findFileRecursive(fullPath, filename);
            if (found) return found;
        } else {
            const currentName = normalize(file.name);
            if (currentName === targetName) {
                return fullPath;
            }
        }
    }
    return null;
}

// --- CODE SELF-ANALYSIS TOOLS ---
async function listCode(dirName = '') {
    try {
        const basePath = BACKEND_ROOT;
        if (dirName) {
            const lowerDir = dirName.toLowerCase();
            if (lowerDir === 'source' || lowerDir === 'source folder') dirName = 'src';
            else if (lowerDir === 'root' || lowerDir === 'project root' || lowerDir === '.' || lowerDir === 'current directory') dirName = '';
        }

        let targetPath = path.join(basePath, dirName);

        if (dirName && !fs.existsSync(targetPath)) {
            console.log(`[Tool] Directory ${dirName} not found at root. Searching recursively...`);
            const foundDir = findDirectoryRecursive(basePath, dirName);
            if (foundDir) {
                targetPath = foundDir;
            } else {
                return `Error: Directory ${dirName} not found anywhere in the project.`;
            }
        }

        if (!targetPath.startsWith(basePath)) return "Error: Cannot read outside project directory.";
        const entries = fs.readdirSync(targetPath, { withFileTypes: true });
        const result = entries.map(e => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`).join('\n');
        return `Contents of ${path.relative(basePath, targetPath) || 'project root'}:\n${result}`;
    } catch (error) {
        return `Error listing code: ${error.message}`;
    }
}

async function readCode(filePaths) {
    try {
        const basePath = BACKEND_ROOT;
        const filesToRead = Array.isArray(filePaths) ? filePaths : [filePaths];
        
        let finalResult = '';
        
        for (const currentFile of filesToRead) {
            let safePath = path.normalize(currentFile).replace(/^(\.\.(\/|\\|$))+/, '');
            let content = projectCache.getFile(safePath);
            
            if (!content) {
                const baseName = path.basename(safePath);
                console.log(`[Tool] File not found at ${safePath}. Checking cache for ${baseName}...`);
                const foundPath = projectCache.findFile(baseName);
                
                if (foundPath) {
                    console.log(`[Tool] Cache resolved: ${foundPath}`);
                    content = projectCache.getFile(foundPath);
                    safePath = foundPath;
                } else {
                    finalResult += `\nError: File ${baseName} not found in project cache.\n`;
                    continue;
                }
            }
            
            content = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const systemContext = `[SYSTEM NOTE: This code is read from Atlas's own local working directory. It is not an external project unless explicitly stated by the user.]\n`;
            finalResult += `\nContent of ${safePath}:\n\n${systemContext}${content}\n\n`;
        }
        
        return finalResult.trim() || "No files could be read.";
    } catch (error) {
        return `Error reading code: ${error.message}`;
    }
}

// --- NEW: FULL DIRECTORY TREE TOOL ---
async function getDirectoryTree(dirName = '') {
    try {
        const basePath = BACKEND_ROOT;
        if (dirName) {
            const lowerDir = dirName.toLowerCase();
            if (lowerDir === 'source' || lowerDir === 'source folder') dirName = 'src';
            else if (lowerDir === 'root' || lowerDir === 'project root' || lowerDir === '.' || lowerDir === 'current directory') dirName = '';
        }

        let targetPath = path.join(basePath, dirName);

        if (dirName && !fs.existsSync(targetPath)) {
            const foundDir = findDirectoryRecursive(basePath, dirName);
            if (foundDir) targetPath = foundDir;
            else return `Error: Directory ${dirName} not found.`;
        }

        if (!targetPath.startsWith(basePath)) return "Error: Cannot read outside project directory.";

        const buildTree = (dir, prefix = '') => {
            const files = fs.readdirSync(dir, { withFileTypes: true });
            let result = '';
            files.forEach((file, index) => {
                if (file.name === 'node_modules' || file.name === '.git' || file.name === '.env') return;
                const isLast = index === files.length - 1;
                const connector = isLast ? '└── ' : '├── ';
                result += `${prefix}${connector}${file.name}\n`;
                if (file.isDirectory()) {
                    const newPrefix = prefix + (isLast ? '    ' : '│   ');
                    result += buildTree(path.join(dir, file.name), newPrefix);
                }
            });
            return result;
        };

        const tree = buildTree(targetPath);
        return `Directory Tree:\n${tree}`;
    } catch (error) {
        return `Error generating tree: ${error.message}`;
    }
}

async function readCodeDirectory(dirName = '') {
    try {
        let safeDir = dirName.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
        
        if (safeDir === 'source' || safeDir === 'source folder') safeDir = 'src';
        if (safeDir === 'root' || safeDir === 'project root' || safeDir === '.' || safeDir === 'current directory') safeDir = '';

        const prefix = safeDir ? `${safeDir}/` : '';
        const tree = projectCache.getTree();
        
        let result = '';
        for (const filePath of tree) {
            if (filePath.startsWith(prefix)) {
                let content = projectCache.getFile(filePath);
                if (content) {
                    content = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    result += `\n=== FILE: ${filePath} ===\n${content}\n`;
                }
            }
        }
        return result || "No code files found in directory.";
    } catch (error) {
        return `Error reading directory: ${error.message}`;
    }
}

// --- RENAME NOTE TOOL ---
async function renameNote(oldFilename, newFilename) {
    try {
        const oldSafe = sanitizeFilename(oldFilename);
        const newSafe = sanitizeFilename(newFilename);
        const notesDir = path.join(BACKEND_ROOT, 'notes');
        const oldPath = path.join(notesDir, oldSafe);
        const newPath = path.join(notesDir, newSafe);

        if (!fs.existsSync(oldPath)) return `Error: Note ${oldSafe} not found.`;
        if (fs.existsSync(newPath)) return `Error: Note ${newSafe} already exists.`;

        fs.renameSync(oldPath, newPath);
        return `Successfully renamed ${oldSafe} to ${newSafe}.`;
    } catch (error) {
        return `Error renaming note: ${error.message}`;
    }
}

// --- PHASE 6: CODE PROPOSAL TOOL ---
async function writeProposal(targetFilename, reason, risk, proposedCode) {
    try {
        const proposalsDir = path.join(BACKEND_ROOT, 'proposals');
        if (!fs.existsSync(proposalsDir)) fs.mkdirSync(proposalsDir);
        
        let safeName = path.basename(targetFilename).replace(/\.\w+$/, '');
        const proposalFile = path.join(proposalsDir, `${safeName}_proposal_${Date.now()}.md`);
        
        const content = `# Code Change Proposal

**Target File:** ${targetFilename}
**Reason:** ${reason}
**Risk Level:** ${risk}

---
### Proposed Code:

\`\`\`javascript
 ${proposedCode}
\`\`\`
`;
        
        fs.writeFileSync(proposalFile, content, 'utf8');
        return `Successfully created code change proposal at proposals/${path.basename(proposalFile)}. Please review it to apply the changes.`;
    } catch (error) {
        return `Error creating proposal: ${error.message}`;
    }
}

module.exports = {
    webSearch,
    getTime,
    convertTime,
    calculate,
    listNotes,
    writeNote,
    appendNote,
    readNote,
    deleteNote,
    searchKnowledge,
    updateDevState,
    listCode,
    readCode,
    getDirectoryTree,
    readCodeDirectory,
    renameNote,
    writeProposal
};