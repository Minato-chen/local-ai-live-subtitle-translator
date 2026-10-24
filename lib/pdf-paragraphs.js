(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PdfParagraphsLib = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function cleanPdfText(rawText) {
    return String(rawText || "")
      .replace(/\r\n/g, "\n")
      .replace(/([a-zA-Z])-\s*\n\s*([a-zA-Z])/gu, "$1$2")
      .replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\s*\n\s*([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu, "$1$2")
      .replace(/\n+/g, " ")
      .replace(/[ \t\f\v]+/g, " ")
      .trim();
  }

  function joinParagraphTexts(firstText, secondText) {
    const a = String(firstText || "").trim();
    const b = String(secondText || "").trim();
    if (!a) return b;
    if (!b) return a;
    if (/[a-zA-Z]-$/u.test(a) && /^[a-zA-Z]/u.test(b)) {
      return `${a.slice(0, -1)}${b}`;
    }
    if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(a)) {
      return `${a}${b}`;
    }
    return `${a} ${b}`;
  }

  function normalizeTextItemsToBoxes(items, pageBox = { width: 600, height: 800, xMin: 0, yMin: 0 }, skipPageNumbers = true) {
    const pageHeight = Math.max(100, Number(pageBox?.height) || 800);
    const xMin = Number(pageBox?.xMin) || 0;
    const yMin = Number(pageBox?.yMin) || 0;
    if (!Array.isArray(items) || !items.length) return [];

    const boxes = [];
    for (const item of items) {
      const str = String(item?.str || "");
      if (!str.trim()) continue;
      const tr = Array.isArray(item.transform) ? item.transform : [12, 0, 0, 12, 0, 0];
      const fontSize = Math.max(4.5, Math.hypot(Number(tr[0]) || 0, Number(tr[1]) || 0) || Math.abs(Number(tr[3])) || Number(item.height) || 10);
      const left = (Number(tr[4]) || 0) - xMin;
      const pdfY = (Number(tr[5]) || 0) - yMin;
      const baselineY = pageHeight - pdfY;
      const top = baselineY - fontSize * 0.82;
      const width = Math.max(fontSize * 0.22, Number(item.width) || str.trim().length * fontSize * 0.48);
      const right = left + width;
      const bottom = baselineY + fontSize * 0.20;

      if (skipPageNumbers && (top < pageHeight * 0.045 || bottom > pageHeight * 0.955) && /^\s*(?:page\s*)?\d+\s*$/i.test(str)) {
        continue;
      }
      boxes.push({
        text: str,
        left,
        right,
        top,
        bottom,
        baselineY,
        fontSize,
        fontName: String(item.fontName || ""),
        isScript: false
      });
    }
    return boxes;
  }

  function markScriptBoxes(boxes) {
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      b.isScript = false;
      for (let j = 0; j < boxes.length; j++) {
        if (i === j) continue;
        const other = boxes[j];
        const smallerFont = b.fontSize < other.fontSize * 0.85;
        const shiftedShortToken =
          b.text.trim().length <= 4 &&
          b.fontSize <= other.fontSize * 1.02 &&
          Math.abs(b.baselineY - other.baselineY) >= other.fontSize * 0.16 &&
          Math.abs(b.baselineY - other.baselineY) <= other.fontSize * 0.48;
        if (!smallerFont && !shiftedShortToken) continue;

        if (
          Math.abs(b.baselineY - other.baselineY) <= other.fontSize * 0.58 &&
          b.left <= other.right + other.fontSize * 3.0 &&
          b.right >= other.left - other.fontSize * 1.5
        ) {
          b.isScript = true;
          break;
        }
      }
    }
  }

  function groupBoxesIntoLines(boxes, gutterInfo = null) {
    if (!boxes.length) return [];
    markScriptBoxes(boxes);

    const mainBoxes = boxes.filter((b) => !b.isScript);
    const scriptBoxes = boxes.filter((b) => b.isScript);
    const anchorBoxes = mainBoxes.length > 0 ? mainBoxes : boxes;

    // Strict total order on baselineY then left (transitive, never scrambles lines)
    anchorBoxes.sort((a, b) => a.baselineY - b.baselineY || a.left - b.left);

    const baselineRows = [];
    for (const box of anchorBoxes) {
      let matchedRow = null;
      for (let i = baselineRows.length - 1; i >= Math.max(0, baselineRows.length - 6); i--) {
        const cand = baselineRows[i];
        const maxFont = Math.max(box.fontSize, cand.fontSize);
        if (Math.abs(box.baselineY - cand.baselineY) <= maxFont * 0.28) {
          matchedRow = cand;
          break;
        }
      }
      if (matchedRow) {
        matchedRow.boxes.push(box);
        if (box.fontSize > matchedRow.fontSize) {
          matchedRow.baselineY = box.baselineY;
          matchedRow.fontSize = box.fontSize;
        }
      } else {
        baselineRows.push({
          boxes: [box],
          baselineY: box.baselineY,
          fontSize: box.fontSize
        });
      }
    }

    const rawLines = [];
    for (const row of baselineRows) {
      row.boxes.sort((a, b) => a.left - b.left);
      if (!gutterInfo) {
        let left = Infinity;
        let right = -Infinity;
        let top = Infinity;
        let bottom = -Infinity;
        for (const b of row.boxes) {
          left = Math.min(left, b.left);
          right = Math.max(right, b.right);
          top = Math.min(top, b.top);
          bottom = Math.max(bottom, b.bottom);
        }
        rawLines.push({
          boxes: [...row.boxes],
          left,
          right,
          top,
          bottom,
          baselineY: row.baselineY,
          fontSize: row.fontSize
        });
        continue;
      }

      let currentLine = null;
      for (const box of row.boxes) {
        if (!currentLine) {
          currentLine = {
            boxes: [box],
            left: box.left,
            right: box.right,
            top: box.top,
            bottom: box.bottom,
            baselineY: row.baselineY,
            fontSize: box.fontSize
          };
          continue;
        }
        const maxFont = Math.max(box.fontSize, currentLine.fontSize);
        const horizontalGap = box.left - currentLine.right;
        const inTwoColumnZone = gutterInfo.isTwoColumn && box.top >= gutterInfo.minTop - maxFont * 0.8;
        const crossesGutter =
          inTwoColumnZone &&
          currentLine.left < gutterInfo.splitX - maxFont * 1.5 &&
          currentLine.right <= gutterInfo.splitX + maxFont * 1.2 &&
          box.left >= gutterInfo.splitX - maxFont * 0.8;
        const maxWordGap = inTwoColumnZone ? maxFont * 0.82 : maxFont * 1.45;

        if (!crossesGutter && horizontalGap <= maxWordGap) {
          currentLine.boxes.push(box);
          currentLine.left = Math.min(currentLine.left, box.left);
          currentLine.right = Math.max(currentLine.right, box.right);
          currentLine.top = Math.min(currentLine.top, box.top);
          currentLine.bottom = Math.max(currentLine.bottom, box.bottom);
          currentLine.fontSize = Math.max(currentLine.fontSize, box.fontSize);
        } else {
          rawLines.push(currentLine);
          currentLine = {
            boxes: [box],
            left: box.left,
            right: box.right,
            top: box.top,
            bottom: box.bottom,
            baselineY: row.baselineY,
            fontSize: box.fontSize
          };
        }
      }
      if (currentLine) rawLines.push(currentLine);
    }

    if (mainBoxes.length > 0 && scriptBoxes.length > 0) {
      for (const sb of scriptBoxes) {
        let bestLine = null;
        let bestDist = Infinity;
        for (const line of rawLines) {
          const vDist = Math.abs(sb.baselineY - line.baselineY);
          if (vDist > line.fontSize * 0.58) continue;
          if (sb.left > line.right + line.fontSize * 3.0 || sb.right < line.left - line.fontSize * 1.5) continue;
          if (vDist < bestDist) {
            bestDist = vDist;
            bestLine = line;
          }
        }
        if (bestLine) {
          bestLine.boxes.push(sb);
          bestLine.left = Math.min(bestLine.left, sb.left);
          bestLine.right = Math.max(bestLine.right, sb.right);
          bestLine.top = Math.min(bestLine.top, sb.top);
          bestLine.bottom = Math.max(bestLine.bottom, sb.bottom);
        } else {
          rawLines.push({
            boxes: [sb],
            left: sb.left,
            right: sb.right,
            top: sb.top,
            bottom: sb.bottom,
            baselineY: sb.baselineY,
            fontSize: sb.fontSize
          });
        }
      }
    }

    rawLines.sort((a, b) => a.baselineY - b.baselineY || a.left - b.left);
    return rawLines.map(renderLineBoxes).filter((l) => l.text.length > 0);
  }

  function extractTextFromRect(items, rect, pageBox = { width: 600, height: 800, xMin: 0, yMin: 0 }) {
    if (!rect) return "";
    const rLeft = Math.min(rect.left, rect.right);
    const rRight = Math.max(rect.left, rect.right);
    const rTop = Math.min(rect.top, rect.bottom);
    const rBottom = Math.max(rect.top, rect.bottom);

    const allBoxes = normalizeTextItemsToBoxes(items, pageBox, false);
    const selectedBoxes = allBoxes.filter((b) => {
      const centerY = (b.top + b.bottom) / 2;
      const overlapX = Math.min(b.right, rRight) - Math.max(b.left, rLeft);
      const minOverlap = Math.min(b.right - b.left, b.fontSize * 0.6);
      return centerY >= rTop - 2 && centerY <= rBottom + 2 && overlapX >= Math.max(1, minOverlap * 0.4);
    });

    if (!selectedBoxes.length) return "";

    const renderedLines = groupBoxesIntoLines(selectedBoxes, null);
    if (!renderedLines.length) return "";

    return finalizeParagraph({
      lines: renderedLines,
      left: rLeft,
      right: rRight,
      top: rTop,
      bottom: rBottom,
      fontSize: renderedLines[0].fontSize
    }).text;
  }

  function renderLineBoxes(line) {
    line.boxes.sort((a, b) => a.left - b.left);
    let text = "";
    for (let i = 0; i < line.boxes.length; i++) {
      const curr = line.boxes[i];
      if (i > 0) {
        const prev = line.boxes[i - 1];
        const gap = curr.left - prev.right;
        const minFont = Math.min(prev.fontSize, curr.fontSize);
        const enteringScript = Boolean(curr.isScript && !prev.isScript);
        const leavingScript = Boolean(prev.isScript && !curr.isScript);
        const bothScript = Boolean(prev.isScript && curr.isScript);

        const prevEndsNoSpace = /[\s\-–—(\[/]$/u.test(text);
        const currStartsNoSpace = /^[\s.,!?;:)\]}]/u.test(curr.text);

        let needsSpace = false;
        if (!prevEndsNoSpace && !currStartsNoSpace) {
          if (enteringScript || bothScript) {
            needsSpace = gap > minFont * 0.45;
          } else if (leavingScript) {
            needsSpace = gap > minFont * 0.08 || /^[A-Za-z0-9\u0370-\u03FF]/u.test(curr.text);
          } else {
            const fontSwitchWordToSym =
              (/[A-Za-z]{2,}$/u.test(text) && /^[\u0370-\u03FF]/u.test(curr.text)) ||
              (/[\u0370-\u03FF]$/u.test(text) && /^[A-Za-z]{2,}/u.test(curr.text));
            needsSpace = gap > minFont * 0.11 || (fontSwitchWordToSym && gap >= -minFont * 0.05);
          }
        }
        if (needsSpace) text += " ";
      }
      text += curr.text;
    }
    return {
      text: text.replace(/\s+/g, " ").trim(),
      left: line.left,
      right: line.right,
      top: line.top,
      bottom: line.bottom,
      baselineY: line.baselineY,
      fontSize: line.fontSize
    };
  }

  function extractParagraphsFromTextItems(items, pageBox = { width: 600, height: 800, xMin: 0, yMin: 0 }) {
    const pageWidth = Math.max(100, Number(pageBox?.width) || 600);
    const boxes = normalizeTextItemsToBoxes(items, pageBox, true);
    if (!boxes.length) return [];

    const gutterInfo = detectVerticalGutterFromBoxes(boxes, pageWidth);
    const lines = groupBoxesIntoLines(boxes, gutterInfo);
    const { isTwoColumn, splitX, minTop } = gutterInfo;

    for (const line of lines) {
      const width = line.right - line.left;
      const inTwoColumnZone = isTwoColumn && line.top >= minTop - line.fontSize;
      const crossesSplit = line.left < splitX - line.fontSize * 2.0 && line.right > splitX + line.fontSize * 2.0;
      if (!inTwoColumnZone || (crossesSplit && width > pageWidth * 0.48)) {
        line.column = "full";
      } else if ((line.left + line.right) / 2 < splitX) {
        line.column = "left";
      } else {
        line.column = "right";
      }
    }

    if (isTwoColumn) {
      lines.sort((a, b) => a.top - b.top);
      for (let i = 1; i < lines.length; i++) {
        const prev = lines[i - 1];
        const curr = lines[i];
        if (
          prev.column === "full" &&
          curr.column === "left" &&
          curr.top - prev.bottom <= prev.fontSize * 0.85 &&
          Math.abs(curr.left - prev.left) <= prev.fontSize * 1.5
        ) {
          const hasRightCounterpart = lines.some(
            (other) => other !== curr && other.column === "right" && Math.abs(other.top - curr.top) <= curr.fontSize * 0.8
          );
          if (!hasRightCounterpart) {
            curr.column = "full";
          }
        }
      }
    }

    let orderedLines = [];
    if (!isTwoColumn) {
      orderedLines = lines.sort((a, b) => a.top - b.top);
    } else {
      lines.sort((a, b) => a.top - b.top);
      let leftBand = [];
      let rightBand = [];
      const flushBand = () => {
        if (leftBand.length) {
          orderedLines.push(...leftBand.sort((a, b) => a.top - b.top));
          leftBand = [];
        }
        if (rightBand.length) {
          orderedLines.push(...rightBand.sort((a, b) => a.top - b.top));
          rightBand = [];
        }
      };
      for (const line of lines) {
        if (line.column === "full") {
          flushBand();
          orderedLines.push(line);
        } else if (line.column === "left") {
          leftBand.push(line);
        } else {
          rightBand.push(line);
        }
      }
      flushBand();
    }

    const paragraphs = [];
    let current = null;

    for (const line of orderedLines) {
      if (!current) {
        current = startParagraph(line);
        continue;
      }
      if (shouldStartNewParagraph(current, line, pageWidth, isTwoColumn, splitX)) {
        paragraphs.push(finalizeParagraph(current));
        current = startParagraph(line);
      } else {
        appendLineToParagraph(current, line);
      }
    }
    if (current) paragraphs.push(finalizeParagraph(current));

    return paragraphs.filter((p) => isMeaningfulParagraph(p.text));
  }

  function detectVerticalGutterFromBoxes(boxes, pageWidth) {
    const rows = [];
    for (const box of boxes) {
      if (box.right - box.left > pageWidth * 0.55) continue;
      let row = rows.find((r) => Math.abs(r.top - box.top) <= Math.max(r.fontSize, box.fontSize) * 0.6);
      if (!row) {
        row = { top: box.top, bottom: box.bottom, fontSize: box.fontSize, boxes: [] };
        rows.push(row);
      } else {
        row.top = Math.min(row.top, box.top);
        row.bottom = Math.max(row.bottom, box.bottom);
        row.fontSize = Math.max(row.fontSize, box.fontSize);
      }
      row.boxes.push(box);
    }

    let bestX = pageWidth * 0.5;
    let bestScore = 0;
    let bestMinTop = 0;

    for (let ratio = 0.28; ratio <= 0.72; ratio += 0.01) {
      const candidateX = pageWidth * ratio;
      let pairedRows = 0;
      let crossedRows = 0;
      let minPairedTop = Infinity;

      for (const row of rows) {
        const crosses = row.boxes.some((b) => b.left < candidateX - 10 && b.right > candidateX + 10 && b.fontSize >= row.fontSize * 0.85);
        if (crosses) {
          crossedRows++;
          continue;
        }
        const leftBoxes = row.boxes.filter((b) => b.left < candidateX - 25 && b.right <= candidateX + 10);
        const rightBoxes = row.boxes.filter((b) => b.left >= candidateX - 6 && (b.right - b.left) >= row.fontSize * 2.5);
        if (leftBoxes.length > 0 && rightBoxes.length > 0) {
          const maxLeftRight = Math.max(...leftBoxes.map((b) => b.right));
          const minRightLeft = Math.min(...rightBoxes.map((b) => b.left));
          if (minRightLeft - maxLeftRight >= -2) {
            pairedRows++;
            minPairedTop = Math.min(minPairedTop, row.top);
          }
        }
      }

      if (pairedRows >= 4) {
        const centerBonus = 1 - Math.abs(ratio - 0.5) * 0.4;
        const score = pairedRows - crossedRows * 0.4 + centerBonus;
        if (score > bestScore) {
          bestScore = score;
          bestX = candidateX;
          bestMinTop = minPairedTop;
        }
      }
    }

    return {
      isTwoColumn: bestScore >= 4,
      splitX: bestX,
      minTop: bestMinTop
    };
  }

  function startParagraph(line) {
    return {
      lines: [line],
      column: line.column,
      left: line.left,
      right: line.right,
      top: line.top,
      bottom: line.bottom,
      fontSize: line.fontSize
    };
  }

  function appendLineToParagraph(paragraph, line) {
    paragraph.lines.push(line);
    paragraph.left = Math.min(paragraph.left, line.left);
    paragraph.right = Math.max(paragraph.right, line.right);
    paragraph.bottom = Math.max(paragraph.bottom, line.bottom);
  }

  function isStandaloneHeading(text) {
    const clean = String(text || "").trim();
    if (!clean || clean.length > 75) return false;
    // Must start with uppercase or section number, and match the ENTIRE line (not a word like "results in...")
    if (/^(?:(?:[1-9]\d*(?:\.\d+)*\.?|[IVX]+\.)\s+)?(?:Abstract|Introduction|Significance|Results|Discussion|Materials and [Mm]ethods|Methods|Conclusions?|References|Acknowledg(?:e)?ments|Appendix|Supporting Information)$/u.test(clean)) {
      return true;
    }
    if (/^(?:[1-9]\d*(?:\.\d+)+|[IVX]+\.)\s+[A-Z][^\n.!?;]{1,60}$/u.test(clean)) {
      return true;
    }
    return false;
  }

  function shouldStartNewParagraph(current, nextLine, pageWidth, isTwoColumn, splitX) {
    const prevLine = current.lines[current.lines.length - 1];
    if (current.column !== nextLine.column) return true;

    const verticalGap = nextLine.top - prevLine.bottom;
    const avgFont = (prevLine.fontSize + nextLine.fontSize) / 2;

    if (verticalGap > avgFont * 0.65 || verticalGap < -avgFont * 1.5) return true;
    if (Math.abs(nextLine.fontSize - prevLine.fontSize) > 1.4) return true;

    if (isStandaloneHeading(prevLine.text)) return true;

    const endsSentence = /[.!?:。！？：]["”')\]]?$/u.test(prevLine.text);
    if (endsSentence && isStandaloneHeading(nextLine.text)) return true;

    if (/^(?:[•·▪▸]|\(\d+\)|\[\d+\])\s+/u.test(nextLine.text)) return true;

    const colWidth = isTwoColumn && nextLine.column !== "full"
      ? (nextLine.column === "left" ? splitX * 0.82 : (pageWidth - splitX) * 0.82)
      : pageWidth * 0.78;
    const prevWidth = prevLine.right - prevLine.left;
    const indentedNext = nextLine.left - current.left > avgFont * 0.6 && nextLine.left - prevLine.left > avgFont * 0.5;
    const shortPrevLine = prevWidth < colWidth * 0.76;

    if (endsSentence && (indentedNext || shortPrevLine)) return true;

    return false;
  }

  function finalizeParagraph(paragraph) {
    let text = "";
    for (let i = 0; i < paragraph.lines.length; i++) {
      const lineText = paragraph.lines[i].text;
      if (i === 0) {
        text = lineText;
        continue;
      }
      if (/[a-zA-Z]-$/u.test(text) && /^[a-z]/u.test(lineText)) {
        text = text.slice(0, -1) + lineText;
      } else if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(text)) {
        text += lineText;
      } else {
        text += " " + lineText;
      }
    }
    return {
      text: text.replace(/\s+/g, " ").trim(),
      top: paragraph.top,
      bottom: paragraph.bottom,
      left: paragraph.left,
      right: paragraph.right,
      fontSize: paragraph.fontSize
    };
  }

  function isMeaningfulParagraph(text) {
    if (!text || text.length < 3) return false;
    const letters = (text.match(/\p{L}/gu) || []).length;
    if (letters < 3) return false;
    const nonSpace = text.replace(/\s+/g, "").length;
    if (letters / nonSpace < 0.35) return false;
    return true;
  }

  return {
    cleanPdfText,
    joinParagraphTexts,
    extractTextFromRect,
    extractParagraphsFromTextItems,
    isMeaningfulParagraph
  };
});
