/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiTitle,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import type { FC, PropsWithChildren } from 'react';
import React from 'react';
import { LogEntryCategoriesSetupView } from './log_entry_categories_setup_view';
import { LogEntryRateSetupView } from './log_entry_rate_setup_view';
import { LogAnalysisModuleList } from './module_list';
import type { ModuleId } from './setup_flyout_state';
import { moduleIds, useLogAnalysisSetupFlyoutStateContext } from './setup_flyout_state';

const FLYOUT_HEADING_ID = 'logAnalysisSetupFlyoutHeading';

export const LogAnalysisSetupFlyout: React.FC<{
  allowedModules?: ModuleId[];
}> = ({ allowedModules = moduleIds }) => {
  const { closeFlyout, flyoutView, showModuleList, showModuleSetup } =
    useLogAnalysisSetupFlyoutStateContext();

  if (flyoutView.view === 'hidden') {
    return null;
  }

  return (
    <EuiFlyout
      aria-labelledby={FLYOUT_HEADING_ID}
      maxWidth={800}
      onClose={closeFlyout}
      data-test-subj="infraLogAnalysisSetupFlyout"
    >
      <EuiFlyoutHeader hasBorder>
        <EuiTitle>
          <h2 id={FLYOUT_HEADING_ID}>
            <FormattedMessage
              id="xpack.infra.logs.analysis.setupFlyoutTitle"
              defaultMessage="Anomaly detection with Machine Learning"
            />
          </h2>
        </EuiTitle>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        {flyoutView.view === 'moduleList' ? (
          <LogAnalysisModuleList onViewModuleSetup={showModuleSetup} />
        ) : flyoutView.view === 'moduleSetup' && allowedModules.includes(flyoutView.module) ? (
          <ModuleSetupView
            moduleId={flyoutView.module}
            onClose={closeFlyout}
            onViewModuleList={allowedModules.length > 1 ? showModuleList : undefined}
          />
        ) : null}
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};

const ModuleSetupView: React.FC<{
  moduleId: ModuleId;
  onClose: () => void;
  onViewModuleList?: () => void;
}> = ({ moduleId, onClose, onViewModuleList }) => {
  switch (moduleId) {
    case 'logs_ui_analysis':
      return (
        <LogAnalysisSetupFlyoutSubPage onViewModuleList={onViewModuleList}>
          <LogEntryRateSetupView onClose={onClose} />
        </LogAnalysisSetupFlyoutSubPage>
      );
    case 'logs_ui_categories':
      return (
        <LogAnalysisSetupFlyoutSubPage onViewModuleList={onViewModuleList}>
          <LogEntryCategoriesSetupView onClose={onClose} />
        </LogAnalysisSetupFlyoutSubPage>
      );
  }
};

const LogAnalysisSetupFlyoutSubPage: FC<
  PropsWithChildren<{
    children: React.ReactNode;
    onViewModuleList?: () => void;
  }>
> = ({ children, onViewModuleList }) => (
  <EuiFlexGroup alignItems="flexStart" direction="column" gutterSize="none">
    {onViewModuleList ? (
      <EuiFlexItem grow={false}>
        <EuiButtonEmpty
          data-test-subj="infraLogAnalysisSetupFlyoutSubPageAllMachineLearningJobsButton"
          flush="left"
          iconSide="left"
          iconType="arrowLeft"
          onClick={onViewModuleList}
        >
          <FormattedMessage
            id="xpack.infra.logs.analysis.setupFlyoutGotoListButtonLabel"
            defaultMessage="All Machine Learning jobs"
          />
        </EuiButtonEmpty>
      </EuiFlexItem>
    ) : null}
    <EuiFlexItem>{children}</EuiFlexItem>
  </EuiFlexGroup>
);
