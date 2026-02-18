/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import type { HttpStart } from '@kbn/core/public';
import type { KibanaProject as SolutionId } from '@kbn/projects-solutions-groups';
import type { monaco } from '@kbn/monaco';
import { BROWSER_POPOVER_WIDTH, DataSourceSelectionChange } from '@kbn/esql-resource-browser';
import {
  getLocatedSourceItemsFromQuery,
  getQueryWithoutLastPipe,
  getRangeFromOffsets,
} from './utils';
import { BROWSER_POPOVER_VERTICAL_OFFSET, DEFAULT_FIELDS_BROWSER_INDEX } from './constants';
import type { BrowserPopoverPosition } from './types';

interface UseFieldsBrowserParams {
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | undefined>;
  editorModel: MutableRefObject<monaco.editor.ITextModel | undefined>;
  http: HttpStart;
  activeSolutionId?: SolutionId;
}

export function useFieldsBrowser({
  editorRef,
  editorModel,
  http,
  activeSolutionId,
}: UseFieldsBrowserParams) {
  const [isFieldsBrowserOpen, setIsFieldsBrowserOpen] = useState(false);
  const [browserPopoverPosition, setBrowserPopoverPosition] = useState<BrowserPopoverPosition>({});

  const [preloadedFields, setPreloadedFields] = useState<
    Array<{ name: string; type?: string }> | undefined
  >(undefined);
  const [simplifiedQuery, setSimplifiedQuery] = useState<string>('');
  const [fullQuery, setFullQuery] = useState<string>('');

  // Offset where we start inserting the selected field.
  // We keep this stable for the lifetime of an open popover session.
  const insertAnchorOffsetRef = useRef<number | undefined>(undefined);
  // Length of the currently inserted text at the anchor. Used so we can replace our own inserted
  // segment when selection changes without scanning/re-parsing the query.
  const insertedTextLengthRef = useRef(0);

  const updatePopoverPosition = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const cursorPosition = editor.getPosition();
    if (!cursorPosition) return;

    const editorCoords = editor.getDomNode()?.getBoundingClientRect();
    const editorPosition = editor.getScrolledVisiblePosition(cursorPosition);
    if (!editorCoords || !editorPosition) return;

    const absoluteTop =
      editorCoords.top + (editorPosition.top ?? 0) + BROWSER_POPOVER_VERTICAL_OFFSET;
    let absoluteLeft = editorCoords.left + (editorPosition.left ?? 0);

    if (absoluteLeft > editorCoords.width) {
      absoluteLeft = absoluteLeft - BROWSER_POPOVER_WIDTH;
    }

    setBrowserPopoverPosition({ top: absoluteTop, left: absoluteLeft });
  }, [editorRef]);

  const openFieldsBrowser = useCallback(
    async (options?: { preloadedFields?: Array<{ name: string; type?: string }> }) => {
      const model = editorModel.current;
      const editor = editorRef.current;
      if (!model || !editor) return;

      // Reset per-open-session state.
      insertedTextLengthRef.current = 0;
      setPreloadedFields(options?.preloadedFields);

      const fullText = model.getValue() || '';
      setFullQuery(fullText);
      const simplified = getQueryWithoutLastPipe(fullText);
      const mainSources = getLocatedSourceItemsFromQuery(simplified)
        .map((s) => s.name)
        .filter((name): name is string => Boolean(name));
      const indexPattern = mainSources.length
        ? mainSources.join(',')
        : DEFAULT_FIELDS_BROWSER_INDEX;
      const esqlQuery =
        simplified.trim() && mainSources.length ? simplified.trim() : `FROM ${indexPattern}`;

      setSimplifiedQuery(esqlQuery);
      const cursorPosition = editor.getPosition();
      if (!cursorPosition) return;

      const cursorOffset = model.getOffsetAt(cursorPosition);
      insertAnchorOffsetRef.current = cursorOffset;

      updatePopoverPosition();
      setIsFieldsBrowserOpen(true);
    },
    [editorModel, editorRef, updatePopoverPosition]
  );

  const handleFieldsBrowserSelect = useCallback(
    (fieldName: string, change: DataSourceSelectionChange) => {
      const editor = editorRef.current;
      const model = editorModel.current;
      const insertAtOffset = insertAnchorOffsetRef.current;
      if (!editor || !model || insertAtOffset == null) {
        return;
      }

      const textToInsert = change === DataSourceSelectionChange.Add ? fieldName : '';

      const start = insertAtOffset;
      const end = insertAtOffset + insertedTextLengthRef.current;

      editor.executeEdits('fieldsBrowser', [
        {
          range: getRangeFromOffsets(model, start, end),
          text: textToInsert,
        },
      ]);

      insertedTextLengthRef.current = textToInsert.length;
    },
    [editorRef, editorModel]
  );

  return {
    isFieldsBrowserOpen,
    setIsFieldsBrowserOpen,
    browserPopoverPosition,
    preloadedFields,
    simplifiedQuery,
    fullQuery,
    openFieldsBrowser,
    handleFieldsBrowserSelect,
  };
}
