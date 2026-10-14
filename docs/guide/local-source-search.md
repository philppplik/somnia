# Local source search

Status: **In development**. These controls are on a development patch chain, not a published stable release. Desktop, real-model and platform acceptance checks are still open.

Search selected, already-open text files with a local embedding model or an exact phrase. Results are source snippets with citations, not generated answers. The index lives only in memory. Search never silently sends a source to a cloud provider.

## Open search

1. Open the text files you want to search. Only eligible `.txt` and `.md` files already open in this project are listed. Hidden paths, binary files and other file types are excluded.
2. Use the toolbar's **Local source search**, or the command palette command **Local source search (reviewed open text)**. This works across studios without opening chat or changing the active studio.
3. The Agent panel also has a local source search section. Its session is separate from the global dialog.

Opening search does not build an index or download a model. Selecting a folder means its exact parent-folder group of eligible open files. It does not scan disk, import a folder or include nested groups. Keep individual exceptions by changing the checkboxes.

## Optional embedding model setup

1. Choose **Review optional search model setup**.
2. In step 1, choose **Check search model installation**. This reads local runtime metadata. A digest in inventory is not proof of embedding quality or privacy.
3. In step 2, optionally choose **Check device hardware**. Unknown hardware does not block review. The estimate is not a benchmark, memory reservation or speed promise.
4. In step 3, choose **Review exact embedding model download** for `embeddinggemma:300m`. Review the linked terms and use restrictions, estimated size, network access and disk needs.
5. Select the actual Ollama model folder, acknowledge the limits, then choose **Confirm**. Nothing downloads before this review. Cancellation reports the known outcome, not a promise that a shared daemon has stopped.
6. Wait for reconciliation and return to source review. Downloading the model does not build the index or select a chat answer model.

If Ollama is missing or stopped, use the shown setup instructions or the existing explicit start action. Somnia does not silently install the daemon. See the [local AI guide](../ai/LOCAL-AI-IN-SOMNIA.md) for runtime setup and model management.

## Review and build

1. Choose individual files or **Select folder** groups.
2. Review the exact source names and excerpts. Excerpts may be partial; the full selected texts, not only the visible excerpts, will be embedded.
3. Choose the standard batch size of up to 32 chunks, or the conservative size of up to 8. The planned payload is UTF-8 text size, not tokens, serialized request size or a VRAM estimate.
4. Check **Embed these exact selected open texts locally into a memory-only index.**
5. Choose **Build selected-source index**. Preparation, embedding and validation must all finish before **Memory index ready.** appears.

Source limits are 32 files, 256 KiB selected UTF-8 text and 256 chunks. Group overflow is refused as a whole, not clipped. A source, model binding or owner change invalidates the index. Changing the batch size also requires fresh consent and a rebuild. Cancelling a build discards its output; there is no partial-ready fallback.

## Search and filter

Enter a query, then choose **Find source snippets**. Query changes clear old results; search again explicitly.

| Control | Meaning |
| --- | --- |
| **Semantic similarity** | Embeds the query and ranks candidate chunks by cosine similarity. Not truth, confidence or an answer. |
| Exact phrase mode | Literal case-insensitive text within a normalized chunk. No query embedding, regex or cross-chunk phrase matching. |
| **Search within indexed source** | Quick all/single-source candidate choice. |
| **Search a subset of indexed sources** | Any explicit subset of the ready index. Empty means no candidates, never all. No rebuild or new source embedding. |
| **Snippet limit** | Global top 5, 10 or 20 snippets. It does not promise complete source coverage. |
| **Minimum cosine similarity** | Inclusive vector-score cutoff, not a quality threshold. Default accepts any score. |
| **Group snippets by source** | Presentation only. Global ranks and the returned set stay unchanged. |
| **Compact literal previews** | A bounded literal prefix. The full chunk remains available in citation context. Never a generated summary. |

Semantic coverage reports all filtered candidate chunks and sources, cutoff matches, shown snippets and top-k omissions. Per-source coverage includes sources below cutoff and sources omitted by the display limit. **Inspect best chunk** means highest cosine for that source only. An inspected chunk outside the returned list has no displayed citation rank.

Phrase coverage reports the whole filtered bounded index, including zero-match sources, even when the displayed list is shorter. Normalization uses NFC and LF; case and phrase rules are stated in the UI. Exact chunk boundaries can prevent a phrase match.

## Inspect and open a citation

Choose **Review citation context** or **Inspect first returned citation**. Previous/next returned-citation controls follow the current returned global ranks, not every indexed or matching chunk. The reader's source-chunk controls instead move inside that exact source. Browsing an indexed source does not create a ranked search citation.

The reader shows up to three literal chunks around the viewed position. Choose **Open viewed chunk in source editor** to request a proved raw-buffer selection. The raw line range is shown before opening. Model and source binding are checked again, and the editor checks its buffer before selection.

If normalization has no proved raw offset mapping, **Open source without selection** is explicit: no line or selection is claimed. A refused jump is not reported as a successful selection. The global dialog closes after an accepted open request so the editor can receive focus, discarding that dialog's index.

Source snippets are untrusted text. They are never instructions or permission to act.

## Close, cancel and recover

- **Cancel / clear memory index** cancels owned work and releases this session's index and results.
- **Close search and discard index**, Escape or project close ends the global search session. Reopening starts fresh and needs an explicit build.
- There is no disk index, query history, export, background indexing or automatic retry.
- If model identity changes, refresh setup and rebuild. Do not treat old citations as current.
- If the selected source changes, review its current exact text and rebuild.
- If setup or download is unverifiable, refresh before reviewing another action. Do not infer completion from a full progress bar.

## Development limits

Browser tests use synthetic source text, deterministic vectors and synthetic transport responses. They exercise the production embedding adapter, but do not prove actual model quality, physical execution locality, native bridge/CSP behavior, desktop layout or editor selection on a packaged build. No generated answers or persistent index are part of this workflow.

See the [milestone status](../ai/LOCAL-SOURCE-SEARCH-MILESTONE.md) and [local AI acceptance checklist](../ai/LOCAL-AI-ACCEPTANCE.md).
