/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { EuiLink } from '@elastic/eui';

interface MorePipelinesLabelProps {
  count: number;
  onClick: () => void;
}

export const MorePipelinesLabel = ({ count, onClick }: MorePipelinesLabelProps) => {
  return (
    <EuiLink color="primary" onClick={onClick} data-test-subj="morePipelinesNodeLabel">
      {i18n.translate('ingestPipelines.pipelineStructureTree.morePipelinesTreeNodeLabel', {
        defaultMessage: '+{count} more {count, plural,one {pipeline} other {pipelines}}',
        values: { count },
      })}
    </EuiLink>
  );
};
