# DOM Extraction: How Browser-Use Builds Its Lightweight Accessibility Tree

This document explains how Browser-Use extracts and processes DOM state for LLM consumption. The system hybridizes multiple CDP (Chrome DevTools Protocol) techniques into a single pipeline that produces a token-efficient, semantically-rich representation of the page.

---

## 🚀 Copy-Paste Ready: The Injection Scripts

These are the actual JavaScript scripts Browser-Use injects into Chrome via CDP. You can copy these directly into your own projects.

### Script 1: Detect Hidden Click Listeners (React/Vue/Angular)

This script uses the DevTools-only `getEventListeners()` API to find elements with click handlers that are invisible to standard DOM inspection.

```javascript
/**
 * BROWSER-USE: Hidden Event Listener Detector
 *
 * Detects elements with JavaScript click listeners attached by:
 * - React's onClick (synthetic events)
 * - Vue's @click directives
 * - Angular's (click) bindings
 * - jQuery's .on('click', ...)
 * - Native addEventListener('click', ...)
 *
 * REQUIREMENT: Must be executed via CDP Runtime.evaluate with:
 *   { includeCommandLineAPI: true }
 *
 * Returns: Array of DOM element references (not serialized)
 */
(() => {
    // getEventListeners is only available in DevTools context via includeCommandLineAPI
    if (typeof getEventListeners !== 'function') {
        return null;
    }

    const elementsWithListeners = [];
    const allElements = document.querySelectorAll('*');

    for (const el of allElements) {
        try {
            const listeners = getEventListeners(el);
            // Check for click-related event listeners
            if (listeners.click || listeners.mousedown || listeners.mouseup ||
                listeners.pointerdown || listeners.pointerup) {
                elementsWithListeners.push(el);
            }
        } catch (e) {
            // Ignore errors for individual elements (e.g., cross-origin)
        }
    }

    return elementsWithListeners;
})()
```

**How to use with CDP (Python):**
```python
result = await cdp_client.send.Runtime.evaluate(
    params={
        'expression': SCRIPT_ABOVE,
        'includeCommandLineAPI': True,   # <-- THE KEY: enables getEventListeners()
        'returnByValue': False,          # Return object references, not serialized
    },
    session_id=session_id,
)
```

**How to use with CDP (TypeScript/Chrome Extension):**
```typescript
const result = await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
    expression: SCRIPT_ABOVE,
    includeCommandLineAPI: true,  // <-- THE KEY: enables getEventListeners()
    returnByValue: false,
});
```

---

### Script 2: Detect Iframe Scroll Positions

This script captures the actual scroll position of same-origin iframes, which CDP's `DOMSnapshot.captureSnapshot` doesn't always report correctly.

```javascript
/**
 * BROWSER-USE: Iframe Scroll Position Detector
 *
 * Captures scroll positions from all accessible iframes on the page.
 * Cross-origin iframes will be silently skipped.
 *
 * Returns: Object mapping iframe index to {scrollTop, scrollLeft}
 */
(() => {
    const scrollData = {};
    const iframes = document.querySelectorAll('iframe');

    iframes.forEach((iframe, index) => {
        try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            if (doc) {
                scrollData[index] = {
                    scrollTop: doc.documentElement.scrollTop || doc.body.scrollTop || 0,
                    scrollLeft: doc.documentElement.scrollLeft || doc.body.scrollLeft || 0
                };
            }
        } catch (e) {
            // Cross-origin iframe, can't access
        }
    });

    return scrollData;
})()
```

**How to use with CDP:**
```python
result = await cdp_client.send.Runtime.evaluate(
    params={
        'expression': SCRIPT_ABOVE,
        'returnByValue': True,  # We want the actual data, not references
    },
    session_id=session_id,
)
iframe_scroll_positions = result['result']['value']
```

---

### Script 3: Element Visibility Score (Point Sampling)

This script checks if an element is actually visible or covered by overlays/modals.

```javascript
/**
 * BROWSER-USE: Element Visibility Score Calculator
 *
 * Determines what percentage of an element is actually visible by
 * sampling multiple points and checking what's rendered on top.
 *
 * @param {Element} element - The DOM element to check
 * @returns {number} - Visibility score from 0.0 (hidden) to 1.0 (fully visible)
 */
function getVisibilityScore(element) {
    const rect = element.getBoundingClientRect();

    // Zero-size elements are not visible
    if (rect.width === 0 || rect.height === 0) return 0;

    // Sample 5 points: center + 4 corners (with 2px inset)
    const points = [
        { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },  // Center
        { x: rect.left + 2, y: rect.top + 2 },                              // Top-left
        { x: rect.right - 2, y: rect.top + 2 },                             // Top-right
        { x: rect.left + 2, y: rect.bottom - 2 },                           // Bottom-left
        { x: rect.right - 2, y: rect.bottom - 2 },                          // Bottom-right
    ];

    let visiblePoints = 0;
    for (const p of points) {
        // Skip points outside viewport
        if (p.x < 0 || p.y < 0 || p.x > window.innerWidth || p.y > window.innerHeight) {
            continue;
        }

        // Ask browser: "What is the top-most element at this point?"
        const topElement = document.elementFromPoint(p.x, p.y);

        // Element is visible at this point if:
        // 1. The top element IS this element, OR
        // 2. The top element is a CHILD of this element, OR
        // 3. This element CONTAINS the top element
        if (topElement && (element === topElement ||
                          element.contains(topElement) ||
                          topElement.contains(element))) {
            visiblePoints++;
        }
    }

    return visiblePoints / points.length;
}

// Usage: Check all interactive elements
(() => {
    const interactive = document.querySelectorAll('button, a, input, [role="button"]');
    const visible = [];

    for (const el of interactive) {
        const score = getVisibilityScore(el);
        if (score > 0.5) {  // At least 50% visible
            visible.push({
                element: el,
                score: score,
                rect: el.getBoundingClientRect()
            });
        }
    }

    return visible;
})()
```

---

### Script 4: Shadow DOM Piercing Query

This script recursively traverses shadow roots to find elements hidden inside Web Components.

```javascript
/**
 * BROWSER-USE: Shadow DOM Piercing Query
 *
 * Finds all elements matching a selector, including those inside shadow DOM.
 * Standard querySelectorAll stops at shadow boundaries - this pierces through.
 *
 * @param {string} selector - CSS selector to match
 * @param {Element|Document} root - Starting point (default: document)
 * @returns {Element[]} - All matching elements, including those in shadow DOM
 */
function querySelectorAllDeep(selector, root = document) {
    const results = [];

    // Get matches in current scope
    const matches = root.querySelectorAll(selector);
    results.push(...matches);

    // Find all elements that might have shadow roots
    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
        // Check for open shadow root
        if (el.shadowRoot) {
            // Recursively search inside shadow root
            const shadowMatches = querySelectorAllDeep(selector, el.shadowRoot);
            results.push(...shadowMatches);
        }
    }

    return results;
}

// Usage: Find all buttons including those in shadow DOM
(() => {
    return querySelectorAllDeep('button, [role="button"], input[type="submit"]');
})()
```

---

### Complete Resolution Flow: Element References → Backend Node IDs

After the listener detection script returns element references, Browser-Use resolves them to stable `backendNodeId` values:

```python
# Step 1: Execute the script (returns element references)
js_result = await cdp_client.send.Runtime.evaluate(
    params={
        'expression': LISTENER_DETECTION_SCRIPT,
        'includeCommandLineAPI': True,
        'returnByValue': False,  # Return object references
    },
    session_id=session_id,
)

# Step 2: Get the array's object ID
array_object_id = js_result.get('result', {}).get('objectId')

# Step 3: Get array properties to access each element
array_props = await cdp_client.send.Runtime.getProperties(
    params={'objectId': array_object_id, 'ownProperties': True},
    session_id=session_id,
)

# Step 4: Extract element object IDs
element_object_ids = []
for prop in array_props.get('result', []):
    if prop.get('name', '').isdigit():  # Array indices are numeric
        object_id = prop.get('value', {}).get('objectId')
        if object_id:
            element_object_ids.append(object_id)

# Step 5: Resolve each element to its backendNodeId (in parallel)
async def get_backend_node_id(object_id: str) -> int | None:
    try:
        node_info = await cdp_client.send.DOM.describeNode(
            params={'objectId': object_id},
            session_id=session_id,
        )
        return node_info.get('node', {}).get('backendNodeId')
    except Exception:
        return None

backend_ids = await asyncio.gather(*[
    get_backend_node_id(oid) for oid in element_object_ids
])

# Step 6: Clean up to avoid memory leaks
await cdp_client.send.Runtime.releaseObject(
    params={'objectId': array_object_id},
    session_id=session_id,
)

# Result: Set of backend node IDs for elements with click listeners
js_click_listener_backend_ids = {bid for bid in backend_ids if bid is not None}
```

### Why `backendNodeId`? The Stable Element Identifier

Browser-Use uses `backendNodeId` (not `nodeId` or generated UUIDs) as the unique identifier for interactive elements:

| ID Type | Stability | Use Case |
|---------|-----------|----------|
| `nodeId` | Session-only, changes on re-inspection | CDP operations within one session |
| `backendNodeId` | **Stable across DOM mutations** | The ID shown to LLM, stored in selector_map |
| Custom `data-*` attribute | Persists if you inject it | Requires DOM mutation (invasive) |

`backendNodeId` is assigned by Chrome when the element is created and persists even if the DOM is re-traversed or the element moves in the tree. This makes it ideal for the LLM interaction loop where:

1. Extract DOM → serialize to text with `[backendNodeId]` markers
2. LLM outputs action: `click(42)`
3. Look up `selector_map[42]` to get the `EnhancedDOMTreeNode`
4. Execute click using the node's absolute coordinates or XPath

---

## Overview: The Three-Phase Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 1: CDP DATA COLLECTION                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ DOMSnapshot │  │    DOM      │  │ Accessibility│  │  Runtime.evaluate  │ │
│  │  .capture   │  │ .getDocument│  │ .getFullAX  │  │  (JS injection)    │ │
│  │  Snapshot   │  │             │  │    Tree     │  │                    │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────────┬──────────┘ │
│         │                │                │                    │            │
│         ▼                ▼                ▼                    ▼            │
│    Layout data      DOM tree         AX tree             JS listeners      │
│    + bounds       + attributes      + roles              backend IDs       │
│    + paint order  + children        + properties                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PHASE 2: ENHANCED TREE CONSTRUCTION                    │
│                                                                             │
│   For each DOM node:                                                        │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │  EnhancedDOMTreeNode = {                                             │  │
│   │    DOM data (tag, attributes, children)                              │  │
│   │    + AX data (role, name, properties)                                │  │
│   │    + Snapshot data (bounds, paint_order, computed_styles)            │  │
│   │    + has_js_click_listener (from injected script)                    │  │
│   │    + absolute_position (with iframe offset corrections)              │  │
│   │    + is_visible (CSS + viewport + iframe clipping)                   │  │
│   │  }                                                                   │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PHASE 3: SERIALIZATION FOR LLM                         │
│                                                                             │
│   1. Create simplified tree (filter invisible/non-content)                  │
│   2. Paint order filtering (remove occluded elements)                       │
│   3. Optimize tree (collapse empty parents)                                 │
│   4. Bounding box filtering (remove redundant children)                     │
│   5. Assign interactive indices (unique IDs → selector_map)                 │
│                                                                             │
│   Output: SerializedDOMState with selector_map[backend_node_id] → node      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: CDP Data Collection

All data collection happens in `DomService._get_all_trees()` (`browser_use/dom/service.py:248-513`). Four parallel CDP requests gather complementary data:

### 1.1 DOMSnapshot.captureSnapshot — Layout & Paint Order

```python
# service.py:392-402
snapshot = await cdp_client.send.DOMSnapshot.captureSnapshot(
    params={
        'computedStyles': REQUIRED_COMPUTED_STYLES,  # display, visibility, opacity, cursor, etc.
        'includePaintOrder': True,   # Z-order for occlusion detection
        'includeDOMRects': True,     # Bounding boxes in device pixels
    }
)
```

**What it provides:**
- `bounds`: Bounding box `[x, y, width, height]` for every laid-out element
- `paintOrders`: Integer paint order (higher = rendered on top)
- `styles`: Computed CSS values (display, visibility, opacity, cursor, pointer-events)
- `clientRects` / `scrollRects`: Viewport-relative coordinates and scroll positions
- `isClickable`: Sparse boolean array marking elements Chrome considers clickable

**Why it matters:** This is the geometric foundation. Without accurate bounds, you can't:
- Filter invisible elements (saving tokens)
- Calculate click coordinates
- Detect element occlusion

### 1.2 DOM.getDocument — Full DOM Tree

```python
# service.py:404-407
dom_tree = await cdp_client.send.DOM.getDocument(
    params={'depth': -1, 'pierce': True}
)
```

**What it provides:**
- Complete DOM tree with all nodes, attributes, children
- `pierce: True` traverses into iframes and shadow DOM
- `backendNodeId`: Stable identifier that persists across navigations
- `nodeId`: Session-specific ID for CDP operations

**Why it matters:** The DOM tree is the structural skeleton that the snapshot and AX tree data hang off of.

### 1.3 Accessibility.getFullAXTree — Semantic Roles

```python
# service.py:211-246
async def _get_ax_tree_for_all_frames(target_id):
    # Collect AX trees from ALL frames (main + iframes)
    frame_tree = await cdp_client.send.Page.getFrameTree()
    all_frame_ids = collect_all_frame_ids(frame_tree)

    # Parallel fetch AX tree for each frame
    ax_trees = await asyncio.gather(*[
        cdp_client.send.Accessibility.getFullAXTree(params={'frameId': fid})
        for fid in all_frame_ids
    ])

    # Merge all AX nodes
    return {'nodes': merged_nodes}
```

**What it provides:**
- `role`: Semantic role (button, link, textbox, combobox, etc.)
- `name`: Accessible name (from aria-label, text content, etc.)
- `properties`: State properties (checked, expanded, disabled, focusable, etc.)
- `backendDOMNodeId`: Links AX node back to DOM node

**Why it matters:** The AX tree reveals semantic meaning that raw HTML doesn't express. A `<div role="button">` looks like a div in the DOM but acts like a button.

### 1.4 Runtime.evaluate — JavaScript Listener Detection (The Injected Script)

This is where Browser-Use injects JavaScript to detect click handlers that CDP's `isClickable` misses:

```python
# service.py:306-337
js_listener_result = await cdp_client.send.Runtime.evaluate(
    params={
        'expression': """
        (() => {
            // getEventListeners is only available in DevTools context
            if (typeof getEventListeners !== 'function') {
                return null;
            }

            const elementsWithListeners = [];
            const allElements = document.querySelectorAll('*');

            for (const el of allElements) {
                try {
                    const listeners = getEventListeners(el);
                    // Check for click-related event listeners
                    if (listeners.click || listeners.mousedown ||
                        listeners.mouseup || listeners.pointerdown ||
                        listeners.pointerup) {
                        elementsWithListeners.push(el);
                    }
                } catch (e) {
                    // Ignore errors for cross-origin elements
                }
            }

            return elementsWithListeners;
        })()
        """,
        'includeCommandLineAPI': True,  # Enables getEventListeners()
        'returnByValue': False,         # Return object references
    }
)
```

**The injection mechanism:**

1. **`includeCommandLineAPI: True`** — This is the key. It enables Chrome DevTools console APIs like `getEventListeners()` which are normally unavailable to page scripts.

2. **`getEventListeners(el)`** — Returns all event listeners attached to an element, including:
   - React's `onClick` (synthetic events)
   - Vue's `@click` directives
   - Angular's `(click)` bindings
   - jQuery's `.on('click', ...)`
   - Native `addEventListener('click', ...)`

3. **Element references returned** — The script returns actual DOM element references (not serialized data), which are then resolved to `backendNodeId` via `DOM.describeNode`:

```python
# service.py:363-375
async def get_backend_node_id(object_id: str) -> int | None:
    node_info = await cdp_client.send.DOM.describeNode(
        params={'objectId': object_id}
    )
    return node_info.get('node', {}).get('backendNodeId')

# Resolve all in parallel
backend_ids = await asyncio.gather(*[
    get_backend_node_id(oid) for oid in element_object_ids
])
js_click_listener_backend_ids = {bid for bid in backend_ids if bid}
```

**Why it matters:** Modern SPAs (React, Vue, Angular) don't use `onclick` attributes. Their click handlers are invisible to CDP's static analysis. This injection detects them at runtime.

---

## Phase 2: Enhanced Tree Construction

After collecting raw data, `DomService.get_dom_tree()` (`service.py:516-868`) merges everything into `EnhancedDOMTreeNode` objects.

### 2.1 Building Lookup Tables

```python
# service.py:554-564
# O(1) lookup: backendNodeId → AX node
ax_tree_lookup = {
    ax_node['backendDOMNodeId']: ax_node
    for ax_node in ax_tree['nodes']
    if 'backendDOMNodeId' in ax_node
}

# O(1) lookup: backendNodeId → snapshot data (bounds, styles, paint order)
snapshot_lookup = build_snapshot_lookup(snapshot, device_pixel_ratio)
```

The `build_snapshot_lookup()` function (`enhanced_snapshot.py:47-175`) processes the raw snapshot:

```python
# enhanced_snapshot.py:111-121
# CRITICAL: Convert device pixels to CSS pixels
bounding_box = DOMRect(
    x=raw_x / device_pixel_ratio,
    y=raw_y / device_pixel_ratio,
    width=raw_width / device_pixel_ratio,
    height=raw_height / device_pixel_ratio,
)
```

**Why device pixel ratio matters:** On Retina/HiDPI displays, CDP returns coordinates in device pixels (2x or 3x CSS pixels). Without this conversion, click coordinates would be off by 2-3x.

### 2.2 Recursive Node Enhancement

```python
# service.py:567-842
async def _construct_enhanced_node(node, html_frames, total_frame_offset, all_frames):
    # Lookup associated data
    ax_node = ax_tree_lookup.get(node['backendNodeId'])
    snapshot_data = snapshot_lookup.get(node['backendNodeId'])

    # Calculate absolute position (accounting for nested iframes)
    absolute_position = DOMRect(
        x=snapshot_data.bounds.x + total_frame_offset.x,
        y=snapshot_data.bounds.y + total_frame_offset.y,
        width=snapshot_data.bounds.width,
        height=snapshot_data.bounds.height,
    )

    # Create enhanced node
    dom_tree_node = EnhancedDOMTreeNode(
        node_id=node['nodeId'],
        backend_node_id=node['backendNodeId'],
        node_name=node['nodeName'],
        attributes=parsed_attributes,
        ax_node=enhanced_ax_node,
        snapshot_node=snapshot_data,
        has_js_click_listener=node['backendNodeId'] in js_click_listener_backend_ids,
        absolute_position=absolute_position,
        is_visible=None,  # Computed after tree is built
    )

    # Recursively process children, shadow roots, iframes
    # ...
```

### 2.3 Iframe Coordinate Translation

When elements are inside iframes, their coordinates need adjustment:

```python
# service.py:688-710
# When entering an HTML frame, adjust for scroll position
if node['nodeName'] == 'HTML' and node.get('frameId'):
    if snapshot_data and snapshot_data.scrollRects:
        total_frame_offset.x -= snapshot_data.scrollRects.x
        total_frame_offset.y -= snapshot_data.scrollRects.y

# When entering an iframe element, add iframe's position
if node['nodeName'] == 'IFRAME' and snapshot_data.bounds:
    total_frame_offset.x += snapshot_data.bounds.x
    total_frame_offset.y += snapshot_data.bounds.y
```

**The coordinate math:**
```
element_absolute_x = element_local_x + iframe_position_x - iframe_scroll_x
element_absolute_y = element_local_y + iframe_position_y - iframe_scroll_y
```

### 2.4 Visibility Calculation

After tree construction, visibility is computed for each node (`service.py:124-209`):

```python
@classmethod
def is_element_visible_according_to_all_parents(cls, node, html_frames):
    # 1. CSS-based filtering
    if display == 'none' or visibility == 'hidden':
        return False
    if float(opacity) <= 0:
        return False

    # 2. Bounds validation
    if not current_bounds:
        return False

    # 3. Viewport intersection (with 1000px margin below fold)
    for frame in reversed(html_frames):
        if frame.node_name == 'HTML':
            # Check if element intersects frame's viewport
            adjusted_y = current_bounds.y - frame.scrollRects.y
            frame_intersects = (
                adjusted_y < viewport_bottom + 1000 and  # 1000px below-fold tolerance
                adjusted_y + height > viewport_top - 1000
            )
            if not frame_intersects:
                return False
```

---

## Phase 3: Serialization for LLM

`DOMTreeSerializer` (`serializer/serializer.py:41-1259`) transforms the enhanced tree into a token-efficient format.

### 3.1 The Five-Stage Pipeline

```python
# serializer.py:100-148
def serialize_accessible_elements(self):
    # Step 1: Create simplified tree (filter non-content)
    simplified_tree = self._create_simplified_tree(self.root_node)

    # Step 2: Paint order filtering (remove occluded elements)
    if self.paint_order_filtering:
        PaintOrderRemover(simplified_tree).calculate_paint_order()

    # Step 3: Optimize tree (remove unnecessary parents)
    optimized_tree = self._optimize_tree(simplified_tree)

    # Step 4: Bounding box filtering (remove redundant children)
    filtered_tree = self._apply_bounding_box_filtering(optimized_tree)

    # Step 5: Assign interactive indices
    self._assign_interactive_indices_and_mark_new_nodes(filtered_tree)

    return SerializedDOMState(_root=filtered_tree, selector_map=self._selector_map)
```

### 3.2 Simplified Tree Creation

Filters out non-content elements (`serializer.py:435-540`):

```python
DISABLED_ELEMENTS = {'style', 'script', 'head', 'meta', 'link', 'title'}
SVG_ELEMENTS = {'path', 'rect', 'g', 'circle', 'ellipse', ...}  # Decorative

def _create_simplified_tree(self, node):
    # Skip non-content elements
    if node.node_name.lower() in DISABLED_ELEMENTS:
        return None
    if node.node_name.lower() in SVG_ELEMENTS:
        return None

    # Include if visible, scrollable, or has meaningful children
    if is_visible or is_scrollable or has_shadow_content:
        simplified = SimplifiedNode(original_node=node, children=[])
        for child in node.children_and_shadow_roots:
            simplified_child = self._create_simplified_tree(child)
            if simplified_child:
                simplified.children.append(simplified_child)
        return simplified
```

### 3.3 Paint Order Filtering (Occlusion Detection)

Removes elements hidden behind others (`serializer/paint_order.py`):

```python
# paint_order.py:131-197
def calculate_paint_order(self):
    # Sort by paint order (highest = rendered on top)
    elements_by_paint = sorted(all_elements, key=lambda e: e.paint_order, reverse=True)

    # Track "painted" regions using rectangle union
    painted_regions = RectUnionPure()

    for element in elements_by_paint:
        if painted_regions.fully_covers(element.bounds):
            # Element is completely hidden by higher paint-order elements
            element.ignored_by_paint_order = True
        else:
            # Element is at least partially visible
            # Add its bounds to painted regions (if opaque)
            if not is_transparent(element):
                painted_regions.add(element.bounds)
```

**Transparency check:**
```python
# Skip adding transparent elements to coverage
if background_color == 'rgba(0, 0, 0, 0)' or opacity < 0.8:
    continue  # Don't add to painted_regions
```

### 3.4 Interactive Element Detection and ID Assignment

The `ClickableElementDetector` (`serializer/clickable_elements.py:4-246`) uses multiple signals:

```python
class ClickableElementDetector:
    @staticmethod
    def is_interactive(node: EnhancedDOMTreeNode) -> bool:
        # 1. JS click listener (from injected script)
        if node.has_js_click_listener:
            return True

        # 2. Interactive HTML tags
        interactive_tags = {'button', 'input', 'select', 'textarea', 'a',
                          'details', 'summary', 'option', 'optgroup'}
        if node.tag_name.lower() in interactive_tags:
            return True

        # 3. Interactive ARIA roles
        if node.attributes.get('role') in {'button', 'link', 'menuitem',
            'checkbox', 'radio', 'tab', 'textbox', 'combobox', ...}:
            return True

        # 4. AX tree roles
        if node.ax_node and node.ax_node.role in interactive_ax_roles:
            return True

        # 5. Event handler attributes
        if any(attr in node.attributes for attr in
               {'onclick', 'onmousedown', 'tabindex'}):
            return True

        # 6. AX properties indicating interactivity
        if has_ax_property(node, ['focusable', 'editable', 'checked',
                                  'expanded', 'pressed', 'selected']):
            return True

        # 7. Cursor pointer (fallback)
        if node.snapshot_node.cursor_style == 'pointer':
            return True

        return False
```

### 3.5 Unique ID Assignment (The Selector Map)

Interactive elements get assigned to the `selector_map` using their `backend_node_id`:

```python
# serializer.py:708-714
if should_make_interactive:
    node.is_interactive = True
    # backend_node_id is the unique ID shown to the LLM
    self._selector_map[node.original_node.backend_node_id] = node.original_node
    self._interactive_counter += 1
```

**The final output format:**
```
[42]<button type=submit aria-label=Search />
[43]<input type=text name=query placeholder=Enter search... />
[44]<a href=/results role=link />
```

The number in brackets (`[42]`) is the `backend_node_id`. When the LLM outputs an action like `click(42)`, the agent looks up `selector_map[42]` to get the full `EnhancedDOMTreeNode` with:
- Absolute coordinates for clicking
- XPath for fallback selection
- All attributes for verification

---

## How This Enables Set-of-Mark Prompting

The `absolute_position` field on each node enables overlaying IDs on screenshots:

```python
# Each interactive element has:
node.backend_node_id  # The unique ID (e.g., 42)
node.absolute_position  # DOMRect(x=150, y=300, width=100, height=40)

# To overlay on screenshot:
center_x = absolute_position.x + absolute_position.width / 2   # 200
center_y = absolute_position.y + absolute_position.height / 2  # 320

# Draw "[42]" at (200, 320) on the screenshot
```

This creates the "Set-of-Mark" visual prompt where the LLM sees both:
1. The screenshot with numbered markers
2. The DOM tree with `[42]<button ...>`

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `browser_use/dom/service.py` | Main orchestrator: CDP calls, tree construction, visibility |
| `browser_use/dom/enhanced_snapshot.py` | Snapshot parsing, device pixel ratio conversion |
| `browser_use/dom/serializer/serializer.py` | 5-stage serialization pipeline |
| `browser_use/dom/serializer/clickable_elements.py` | Interactive element detection |
| `browser_use/dom/serializer/paint_order.py` | Occlusion detection via paint order |
| `browser_use/dom/views.py` | Data structures (EnhancedDOMTreeNode, etc.) |

---

## Summary: Why This Approach Works

1. **Hybrid data sources** — DOM structure + AX semantics + layout geometry + runtime listeners
2. **Visibility filtering** — Only visible elements reach the LLM (massive token savings)
3. **Paint order filtering** — Occluded elements are excluded (no clicking hidden buttons)
4. **Coordinate accuracy** — Device pixel ratio + iframe offset corrections = precise clicks
5. **Semantic richness** — AX roles tell the LLM what elements *do*, not just what they *are*
6. **JS listener detection** — Catches React/Vue/Angular click handlers that CDP misses
7. **Stable IDs** — `backend_node_id` persists across DOM mutations, enabling reliable actions
