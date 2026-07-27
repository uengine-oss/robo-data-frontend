export function renderReportMarkdown(markdown: string): string {
  const lines = markdown.split('\n')
  let html = ''
  let inList = false

  const closeList = () => {
    if (!inList) return
    html += '</ul>'
    inList = false
  }

  for (const rawLine of lines) {
    const line = escapeHtml(rawLine)
    if (line.startsWith('### ')) {
      closeList()
      html += `<h3 class="md-h3">${renderInline(line.slice(4))}</h3>`
    } else if (line.startsWith('## ')) {
      closeList()
      html += `<h2 class="md-h2">${renderInline(line.slice(3))}</h2>`
    } else if (line.startsWith('# ')) {
      closeList()
      html += `<h1 class="md-h1">${renderInline(line.slice(2))}</h1>`
    } else if (line.startsWith('- ')) {
      if (!inList) {
        html += '<ul class="md-list">'
        inList = true
      }
      html += `<li>${renderInline(line.slice(2))}</li>`
    } else if (line.trim() === '') {
      closeList()
      html += '<div class="md-spacer"></div>'
    } else {
      closeList()
      html += `<p class="md-paragraph">${renderInline(line)}</p>`
    }
  }

  closeList()
  return html
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderInline(value: string): string {
  return value
    .replace(/\*\*(.+?)\*\*/g, '<strong class="md-bold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="md-code">$1</code>')
}
