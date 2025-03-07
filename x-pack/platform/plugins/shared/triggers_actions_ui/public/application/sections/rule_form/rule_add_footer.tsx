/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import {
  EuiFlyoutFooter,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButtonEmpty,
  EuiButton,
  EuiLoadingSpinner,
  EuiSpacer,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useHealthContext } from '../../context/health_context';

interface RuleAddFooterProps {
  isSaving: boolean;
  isFormLoading: boolean;
  isRuleValid: boolean;
  onSave: () => void;
  onCancel: () => void;
  onShowRequest: () => void;
}

export const RuleAddFooter = ({
  isSaving,
  onSave,
  onCancel,
  onShowRequest,
  isFormLoading,
  isRuleValid,
}: RuleAddFooterProps) => {
  const { loadingHealthCheck } = useHealthContext();

  return (
    <EuiFlyoutFooter>
      <EuiFlexGroup justifyContent="spaceBetween">
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty data-test-subj="cancelSaveRuleButton" onClick={onCancel}>
            {i18n.translate('xpack.triggersActionsUI.sections.ruleAddFooter.cancelButtonLabel', {
              defaultMessage: 'Cancel',
            })}
          </EuiButtonEmpty>
        </EuiFlexItem>
        {isFormLoading ? (
          <EuiFlexItem grow={false}>
            <EuiSpacer size="s" />
            <EuiLoadingSpinner size="l" />
          </EuiFlexItem>
        ) : (
          <></>
        )}
        <EuiFlexItem grow={false}>
          <EuiFlexGroup justifyContent="flexEnd" gutterSize="m">
            <EuiFlexItem grow={false}>
              <EuiButton
                fill
                color="primary"
                data-test-subj="showRequestButton"
                isDisabled={loadingHealthCheck || !isRuleValid}
                onClick={onShowRequest}
              >
                <FormattedMessage
                  id="xpack.triggersActionsUI.sections.ruleAddFooter.showRequestButtonLabel"
                  defaultMessage="Show API request"
                />
              </EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                fill
                color="primary"
                data-test-subj="saveRuleButton"
                type="submit"
                iconType="check"
                isDisabled={loadingHealthCheck}
                isLoading={isSaving}
                onClick={onSave}
              >
                <FormattedMessage
                  id="xpack.triggersActionsUI.sections.ruleAddFooter.saveButtonLabel"
                  defaultMessage="Save"
                />
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlyoutFooter>
  );
};

// eslint-disable-next-line import/no-default-export
export { RuleAddFooter as default };
