/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiFlexItem,
  EuiFlexGroup,
  PropsOf,
  EuiCodeBlock,
  EuiMarkdownFormat,
  EuiIcon,
  EuiToolTip,
  EuiLink,
  EuiIconProps,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { HttpSetup } from '@kbn/core/public';
import { createMisconfigurationFindingsQuery } from '@kbn/cloud-security-posture';
import type { BenchmarkId } from '@kbn/cloud-security-posture-common';
import { BenchmarkName } from '@kbn/cloud-security-posture-common';
import { useMisconfigurationFinding } from '@kbn/cloud-security-posture/src/hooks/use_misconfiguration_finding';
import { createDetectionRuleFromBenchmarkRule } from '@kbn/cloud-security-posture/src/utils/create_detection_rule_from_benchmark';
import cisLogoIcon from '../../../assets/icons/cis_logo.svg';
import { CISBenchmarkIcon } from '../../../components/cis_benchmark_icon';

export const EMPTY_VALUE = '-';

export const CodeBlock: React.FC<PropsOf<typeof EuiCodeBlock>> = (props) => (
  <EuiCodeBlock isCopyable paddingSize="s" overflowHeight={300} {...props} />
);

export const CspFlyoutMarkdown: React.FC<PropsOf<typeof EuiMarkdownFormat>> = (props) => (
  <EuiMarkdownFormat textSize="s" {...props} />
);

export const BenchmarkIcons = ({
  benchmarkId,
  benchmarkName,
  size = 'xl',
}: {
  benchmarkId: BenchmarkId;
  benchmarkName: BenchmarkName;
  size?: EuiIconProps['size'];
}) => (
  <EuiFlexGroup gutterSize="s" alignItems="center">
    {benchmarkId.startsWith('cis') && (
      <EuiFlexItem grow={false}>
        <EuiToolTip content="Center for Internet Security">
          <EuiIcon type={cisLogoIcon} size={size} />
        </EuiToolTip>
      </EuiFlexItem>
    )}
    <EuiFlexItem grow={false}>
      <CISBenchmarkIcon type={benchmarkId} name={benchmarkName} size={size} />
    </EuiFlexItem>
  </EuiFlexGroup>
);

export const RuleNameLink = ({
  ruleFlyoutLink,
  ruleName,
}: {
  ruleFlyoutLink?: string;
  ruleName: string;
}) => {
  return ruleFlyoutLink && ruleName ? (
    <EuiToolTip
      position="top"
      content={i18n.translate(
        'xpack.csp.findings.findingsFlyout.ruleNameTabField.ruleNameTooltip',
        { defaultMessage: 'Manage Rule' }
      )}
    >
      <EuiLink href={ruleFlyoutLink}>{ruleName}</EuiLink>
    </EuiToolTip>
  ) : (
    <>{ruleName}</>
  );
};

const FindingsRuleFlyout = ({
  ruleId,
  resourceId,
  children,
}: {
  ruleId: string;
  resourceId: string;
  children: any;
}) => {
  const { data } = useMisconfigurationFinding({
    query: createMisconfigurationFindingsQuery(resourceId, ruleId),
    enabled: true,
    pageSize: 1,
  });

  const finding = data?.result.hits[0]?._source;

  if (!finding) return null;

  return children({
    finding,
    createRuleFn: (http: HttpSetup) => createDetectionRuleFromBenchmarkRule(http, finding?.rule),
  });
};

// eslint-disable-next-line import/no-default-export
export default FindingsRuleFlyout;
