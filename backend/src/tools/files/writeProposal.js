// src/tools/files/writeProposal.js
const fs = require('fs');
const path = require('path');
const BACKEND_ROOT = path.join(__dirname, '../../../');

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
module.exports = writeProposal;