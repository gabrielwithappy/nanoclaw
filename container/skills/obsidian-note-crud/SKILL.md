---
name: obsidian-note-crud
description: Obsidian 노트의 생성, 읽기, 수정, 삭제, 검색 작업을 수행합니다. 새 노트 생성, 노트 내용 읽기, 내용 추가, 노트 삭제, Vault 텍스트 검색, 태그 관리 시 사용합니다. 모든 노트 파일 작업을 위한 Python 스크립트를 제공합니다.
---

# Obsidian Note CRUD

This skill provides Python scripts for note-level operations in an Obsidian Vault: create, read, update, delete, search, and tag management.


## Installation

Dependencies are managed via `uv` at the project root. Run once after cloning:

```bash
uv sync
```

**Windows Compatibility:** All scripts have been updated to handle UTF-8 encoding properly on Windows systems, ensuring Korean and other non-ASCII characters are displayed correctly.

## Usage


Each tool is a standalone Python script located in the `scripts/` directory. You can run them using `python3`.


### Markdown Syntax Guide

When creating or editing notes, you **MUST** first load the `obsidian-markdown` skill for Obsidian Flavored Markdown syntax reference (wikilinks, callouts, embeds, frontmatter, math, Mermaid diagrams, etc.).

#### Critical Formatting Rules

**1. Frontmatter YAML - NO BLANK LINES**
```yaml
---
created: 2026-02-14
tags:
  - 30_RESOURCE/개발/AI
  - 가이드
aliases:
  - OAuth Guide
---
```
❌ **WRONG** (blank lines between list items):
```yaml
tags:

  - tag1

  - tag2
```

**2. Code Blocks & Mermaid - Compact Syntax**
- Do NOT add unnecessary blank lines between statements
- Follow standard formatting for the language
- Mermaid diagrams: Keep participant declarations and arrows compact

**3. Content Paragraphs**
- Use single blank line between paragraphs
- No blank lines within lists unless semantically required

### 1. Create a Note


Creates a new markdown note.

**Command:**
```bash
python3 .claude/skills/obsidian-note-crud/scripts/create_note.py --vault "/path/to/vault" --name "folder/My New Note" --content "# Heading\n\nContent here."
```

**Arguments:**
- `--vault`: Absolute path to the Obsidian Vault root.
- `--name`: Name of the note. You can include subdirectories (e.g., `Daily/2023-10-27`). `.md` extension is automatically added if missing.
- `--content`: The text content of the note.
- `--overwrite`: (Optional) Flag to overwrite if the file already exists.

### 2. Read a Note

Reads the content of an existing note.

**Command:**
```bash
python3 .claude/skills/obsidian-note-crud/scripts/read_note.py --vault "/path/to/vault" --name "My Note"
```

**Arguments:**
- `--vault`: Absolute path to the Obsidian Vault root.
- `--name`: Name of the note to read.

### 3. Update a Note

Updates an existing note by appending content or replacing it entirely.

**Command:**
```bash
python3 .claude/skills/obsidian-note-crud/scripts/update_note.py --vault "/path/to/vault" --name "My Note" --content "\n## New Section" --mode append
```

**Arguments:**
- `--vault`: Absolute path to the Obsidian Vault root.
- `--name`: Name of the note to update.
- `--content`: The content to add or use as replacement.
- `--mode`: `append` (default) to add to the end, or `replace` to overwrite the entire file.

### 4. Delete a Note

Deletes a note permanently.

**Command:**
```bash
python3 .claude/skills/obsidian-note-crud/scripts/delete_note.py --vault "/path/to/vault" --name "My Note"
```

**Arguments:**
- `--vault`: Absolute path to the Obsidian Vault root.
- `--name`: Name of the note to delete.

### 5. Search Notes

Searches for text across all notes in the vault.

**Command:**
```bash
python3 .claude/skills/obsidian-note-crud/scripts/search_notes.py --vault "/path/to/vault" --query "TODO"
```

**Arguments:**
- `--vault`: Absolute path to the Obsidian Vault root.
- `--query`: The text string to search for.
- `--case-sensitive`: (Optional) Perform a case-sensitive search.

### 6. Analyze Tags

Analyzes tag usage across the entire vault to assess organizational efficiency.

**Command:**
```bash
python3 .claude/skills/obsidian-note-crud/scripts/analyze_tags.py --vault "/path/to/vault"
```

**Arguments:**
- `--vault`: Absolute path to the Obsidian Vault root.
- `--output`: (Optional) Path to save the markdown report. If not specified, prints to stdout.
- `--verbose`: (Optional) Show detailed progress during scanning.

**Features:**
- Extracts tags from YAML frontmatter and inline `#tag` format
- Analyzes tag frequency and usage patterns
- Detects tag hierarchies (nested tags with `/`)
- Identifies similar tags that might be duplicates
- Finds low-usage tags
- Generates comprehensive markdown report with recommendations

### 7. Fix Tags

Automatically fixes common tag issues in the vault.

**Command:**
```bash
python3 .claude/skills/obsidian-note-crud/scripts/fix_tags.py --vault "/path/to/vault" --fix-format --dry-run
```

**Arguments:**
- `--vault`: Absolute path to the Obsidian Vault root.
- `--fix-format`: Fix tag formatting issues (e.g., `#tag` ??`tag` in frontmatter).
- `--remove-tags`: Comma-separated list of tags to remove.
- `--remove-pattern`: Regex pattern for tags to remove.
- `--dry-run`: Preview changes without modifying files.
- `--verbose`: Show detailed progress.

**Features:**
- Fixes formatting inconsistencies in frontmatter tags
- Removes unwanted or auto-generated tags
- Dry-run mode for safe preview
- Detailed change summary

## 사용 예시

### 새 노트 생성 (frontmatter 포함)

```bash
python .claude/skills/obsidian-note-crud/scripts/create_note.py \
  --vault "obsidianKMS" \
  --name "0.Inbox/새로운 아이디어" \
  --content "---
created: 2026-02-16
tags:
  - 30_RESOURCE/개발/AI
---

# 제목

내용"
```

### 노트 내용 읽기

```bash
python .claude/skills/obsidian-note-crud/scripts/read_note.py \
  --vault "obsidianKMS" \
  --name "0.Inbox/새로운 아이디어"
```

### 노트에 내용 추가

```bash
python .claude/skills/obsidian-note-crud/scripts/update_note.py \
  --vault "obsidianKMS" \
  --name "0.Inbox/새로운 아이디어" \
  --content "

## 추가 섹션

새로운 내용" \
  --mode append
```

### 태그 분석 실행

```bash
python .claude/skills/obsidian-note-crud/scripts/analyze_tags.py \
  --vault "obsidianKMS" \
  --output "tag-analysis-report.md"
```
