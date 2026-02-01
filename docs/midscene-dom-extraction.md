# Midscene Extraction Architecture

This document explains how Midscene extracts information from UIs using two complementary approaches: DOM extraction and vision-based multimodal extraction.

## Overview

Midscene uses a **vision-first approach** for UI actions - element localization and interactions are based on screenshots only. DOM extraction is optional and used primarily for data extraction and page understanding when needed.

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI Context                                │
├─────────────────────────────────────────────────────────────────┤
│  Screenshot (base64)  +  Optional DOM Tree  +  Viewport Size    │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
    ┌─────────────────────┐       ┌─────────────────────┐
    │  Vision Extraction  │       │   DOM Extraction    │
    │  (Element Locating) │       │  (Data Extraction)  │
    └─────────────────────┘       └─────────────────────┘
```

---

## Part 1: DOM Extraction

### Purpose

DOM extraction captures structured information about page elements for:
- Data extraction tasks (reading text, form values, structured content)
- Page understanding and context
- XPath generation for element re-location
- Hybrid approaches combining vision + DOM

### Entry Point

The extraction starts in the page implementation:

```
packages/web-integration/src/puppeteer/base-page.ts
  └─ getElementsNodeTree() (line 302-314)
     └─ Executes: midscene_element_inspector.webExtractNodeTree()
```

### Core Files

| File | Purpose |
|------|---------|
| `packages/shared/src/extractor/web-extractor.ts` | Main extraction logic |
| `packages/shared/src/extractor/dom-util.ts` | Element classification |
| `packages/shared/src/extractor/util.ts` | Rect calculations, visibility |
| `packages/shared/src/extractor/tree.ts` | Tree operations, serialization |
| `packages/shared/src/extractor/locator.ts` | XPath generation |

### Extraction Pipeline

```
document.body
    │
    ▼
extractTreeNode() ─── DFS Traversal
    │
    ├─► collectElementInfo() for each node
    │       │
    │       ├─► elementRect() ─── Visibility & Size Checks
    │       │       • display: none? → skip
    │       │       • visibility: hidden? → skip
    │       │       • opacity: 0? → skip (except inputs)
    │       │       • < 2/3 visible in viewport? → skip
    │       │       • Covered by another element? → skip
    │       │       • Clipped by overflow:hidden parent? → skip
    │       │
    │       ├─► Classify element type (see below)
    │       │
    │       └─► Extract attributes, content, rect
    │
    ├─► Stop recursion at meaningful elements
    │
    └─► Build WebElementNode tree
            │
            ▼
    descriptionOfTree() ─── Serialize to XML-like format
            │
            ▼
    treeToList() ─── Flatten to array for AI
```

### Element Classification

Elements are classified into 6 types based on their HTML semantics:

| NodeType | Elements | Content Extracted |
|----------|----------|-------------------|
| `FORM_ITEM` | `<input>`, `<textarea>`, `<select>`, `<option>` | Value, placeholder, selected option |
| `BUTTON` | `<button>` | innerText or pseudo-element content |
| `IMG` | `<img>`, `<svg>`, elements with background-image | Empty (visual-only) |
| `TEXT` | Text nodes, text-only elements | textContent (normalized) |
| `A` (Anchor) | `<a>` elements | innerText or pseudo-element content |
| `CONTAINER` | Elements with background-color | Empty (layout containers) |

### WebElementInfo Structure

Each extracted element contains:

```typescript
interface WebElementInfo {
  id: string;              // Hash based on rect + content
  indexId: number;         // Sequential index (0, 1, 2...)

  attributes: {
    nodeType: NodeType;    // BUTTON, FORM_ITEM, IMG, TEXT, A, CONTAINER
    htmlTagName: string;   // e.g., "<div>", "<button>"
    class?: string;        // Formatted as ".class1.class2"
    id?: string;           // HTML id attribute
    placeholder?: string;  // For form inputs
    value?: string;        // For form inputs
    // ... other HTML attributes
  };

  content: string;         // Text content (max 300 chars)

  rect: {
    left: number;          // X coordinate (rounded pixels)
    top: number;           // Y coordinate (rounded pixels)
    width: number;         // Element width
    height: number;        // Element height
  };

  center: [number, number]; // Calculated center [x, y]
  isVisible: boolean;       // Visibility in viewport
}
```

### Visibility Filtering Rules

An element is included only if ALL conditions pass:

1. **Size**: Width AND height > 0 (minimum 3x3 pixels for containers)
2. **CSS Display**: Not `display: none`
3. **CSS Visibility**: Not `visibility: hidden`
4. **CSS Opacity**: Not `opacity: 0` (except for `<input>` elements)
5. **Viewport**: At least 2/3 of element visible in viewport
6. **Coverage**: Not completely covered by another element (checked via `document.elementFromPoint`)
7. **Overflow**: Not clipped by `overflow: hidden` ancestor (10px tolerance)

### Tree Serialization Output

The `descriptionOfTree()` function produces XML-like output:

```xml
<div id="abc123" class=".container" left="0" top="0" width="1200" height="800">
  <button id="def456" nodeType="BUTTON Node" left="100" top="50" width="120" height="40">
    Click me
  </button>
  <input id="ghi789" nodeType="FORM_ITEM Node" placeholder="Enter text" left="100" top="100" width="200" height="30">
  </input>
</div>
```

### Recursion Stopping

Once a meaningful element is found, child traversal STOPS:
- `BUTTON` → Children not extracted (button is atomic)
- `FORM_ITEM` → Children not extracted
- `IMG` → Children not extracted
- `TEXT` → Children not extracted
- `CONTAINER` → Children not extracted

This prevents redundant extraction and keeps the tree concise.

### iframe Handling

After main DOM traversal:
1. Find all same-origin iframes
2. Extract children from `iframe.contentDocument.body`
3. Offset all coordinates by iframe's position

---

## Part 2: Vision-Based Multimodal Extraction

### Purpose

Vision extraction uses Vision Language Models (VLMs) to:
- Locate elements by natural language description
- Work across ANY UI surface (web, mobile, desktop, canvas)
- Avoid DOM dependency for UI actions
- Handle dynamic and complex UIs

### Supported Models

| Model Family | Coordinate Format | Special Handling |
|--------------|-------------------|------------------|
| GPT-4o, GPT-4V | Pixel coordinates | High detail mode |
| Qwen2.5-VL, Qwen3-VL | Pixel coordinates | Block padding (28px alignment) |
| Auto-GLM | 0-999 normalized | Special response parsing |
| Doubao Vision | 0-1000 normalized | Bbox preprocessing |
| Gemini | 0-1000 normalized, [y,x,y,x] order | Coordinate reordering |
| UI-TARS | 0-1000 normalized | Action parser integration |

### Core Files

| File | Purpose |
|------|---------|
| `packages/core/src/ai-model/service-caller/index.ts` | VLM API caller |
| `packages/core/src/ai-model/inspect.ts` | Element localization |
| `packages/core/src/ai-model/prompt/llm-locator.ts` | Localization prompts |
| `packages/core/src/ai-model/auto-glm/` | Auto-GLM specific handling |
| `packages/core/src/common.ts` | Bbox-to-rect conversion |
| `packages/shared/src/img/transform.ts` | Image processing |

### Localization Pipeline

```
┌──────────────────────────────────────────────────────────────────┐
│  Input: Screenshot + Element Description                          │
│  "Find the blue Submit button in the form"                       │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  1. Prepare Image                                                 │
│     • Get screenshot as base64                                   │
│     • Optional: Crop to search section                           │
│     • Optional: Pad for Qwen2.5-VL (28px block alignment)        │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  2. Build Chat Messages                                          │
│     [                                                            │
│       { role: "system", content: systemPromptToLocateElement() },│
│       { role: "user", content: [                                 │
│         { type: "image_url", image_url: { url: base64, detail: "high" } },
│         { type: "text", text: "Find: blue Submit button" }       │
│       ]}                                                         │
│     ]                                                            │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  3. Call VLM                                                     │
│     • OpenAI-compatible API                                      │
│     • temperature: 0 (deterministic)                             │
│     • Retry logic for failures                                   │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  4. Parse Response                                               │
│     Standard: { "bbox": [xmin, ymin, xmax, ymax] }              │
│     Auto-GLM: <answer>do(action="Tap", element=[x,y])</answer>  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  5. Convert Coordinates                                          │
│     • adaptBbox() - Handle model-specific formats                │
│     • adaptBboxToRect() - Convert to pixel Rect                  │
│     • Apply section offsets if cropped                           │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Output: LocateResultElement                                     │
│  {                                                               │
│    rect: { left: 450, top: 300, width: 120, height: 40 },       │
│    center: [510, 320],                                           │
│    description: "blue Submit button"                             │
│  }                                                               │
└──────────────────────────────────────────────────────────────────┘
```

### System Prompt Structure

The VLM receives instructions to:
1. Act as a UI element identifier
2. Find elements matching the user's description
3. Return bounding boxes in specific format
4. Report errors if element not found

```typescript
systemPromptToLocateElement(modelFamily) {
  return `
## Role: AI assistant that identifies UI elements
## Objective: Identify elements matching user description
## Output Format: JSON { "bbox": [...], "errors"?: [...] }
...`
}
```

### Coordinate Conversion

Different models return coordinates differently:

```typescript
// Standard models: [xmin, ymin, xmax, ymax] in pixels
adaptBbox([100, 200, 220, 240], width, height, "gpt-4o")
  → [100, 200, 220, 240]

// Gemini: [ymin, xmin, ymax, xmax] normalized 0-1000
adaptBbox([200, 100, 240, 220], 1000, 1000, "gemini")
  → [100, 200, 220, 240]  // Reordered and scaled

// Auto-GLM: [x, y] center point, 0-999 normalized
// Parsed separately via parseAutoGLMLocateResponse()
```

### Section Localization (Two-Stage)

For complex UIs, Midscene can first locate a section, then search within it:

```
Stage 1: AiLocateSection()
  "Find the login form section"
  → Returns section bbox

Stage 2: Crop screenshot to section + AiLocateElement()
  "Find the password input"
  → Returns element bbox (with offset applied)
```

Benefits:
- Narrows search area for more accurate results
- Reduces false positives in dense UIs
- Improves performance by focusing the model

### Image Preprocessing

**Qwen2.5-VL Block Padding:**
```typescript
paddingToMatchBlockByBase64(imageBase64, blockSize = 28)
  // Pads image dimensions to multiples of 28
  // Required for optimal Qwen2.5-VL performance
```

**Section Cropping:**
```typescript
cropByRect(imageBase64, rect, paddingImage)
  // Crops screenshot to section bounds
  // Optional re-padding for block-aligned models
```

---

## Part 3: How They Work Together

### Default Configuration

```typescript
defaultServiceExtractOption = {
  domIncluded: false,         // DOM extraction disabled by default
  screenshotIncluded: true    // Vision always used
}
```

### When DOM is Used

DOM extraction is enabled for:
1. **Data extraction tasks** - Reading structured content from pages
2. **Page understanding** - When context about page structure helps
3. **Hybrid validation** - Confirming vision results with DOM data
4. **XPath generation** - Creating reliable element locators

### UIContext Structure

The unified context passed to AI models:

```typescript
interface UIContext {
  screenshot: string;           // Base64 screenshot (always present)
  size: { width, height };      // Viewport dimensions
  content?: WebElementInfo[];   // DOM elements (optional)
}
```

### Typical Flow

```
User Action: "Click the Submit button"
         │
         ▼
┌─────────────────────────────────────┐
│  Capture Screenshot                  │
│  (Always required)                   │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Vision Localization                 │
│  AiLocateElement("Submit button")    │
│  → Returns rect + center             │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Execute Click                       │
│  Click at center coordinates         │
└─────────────────────────────────────┘


User Action: "Extract all product prices"
         │
         ▼
┌─────────────────────────────────────┐
│  Capture Screenshot + DOM            │
│  (domIncluded: true for extraction)  │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  AI Data Extraction                  │
│  Uses screenshot + DOM tree          │
│  → Returns structured data           │
└─────────────────────────────────────┘
```

---

## Performance Considerations

### DOM Extraction Optimization

- **Visible-only mode**: Set `domIncluded: "visible-only"` to extract only visible elements
- **Warning threshold**: Logs warning if > 5000 elements extracted
- **Recursion stopping**: Prevents deep traversal into atomic elements

### Vision Extraction Optimization

- **Section localization**: Crop to relevant area before detailed search
- **Image resizing**: Automatic scaling for token efficiency
- **Conversation history**: Limits images in context to reduce costs

### Known Issues

**Circular dependency**: If you see "REPLACE_ME_WITH_REPORT_HTML" errors, run:
```bash
pnpm run build:skip-cache
```

---

## Summary

| Aspect | DOM Extraction | Vision Extraction |
|--------|---------------|-------------------|
| **Primary Use** | Data extraction | Element localization |
| **Input** | Live DOM | Screenshot |
| **Output** | Structured tree | Bounding box + center |
| **Works On** | Web pages only | Any UI surface |
| **Speed** | Fast (no AI call) | Slower (VLM inference) |
| **Accuracy** | Exact positions | Model-dependent |
| **Default** | Disabled | Always enabled |

Midscene's architecture enables robust UI automation by combining fast, accurate DOM extraction for data tasks with flexible, universal vision extraction for UI interactions.
