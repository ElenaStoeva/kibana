/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiEmptyPrompt, EuiLink, EuiPageSection } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { useLicenseManagementLocatorApi } from '../common/api/use_license_management_locator_api';

export const SubscriptionNotAllowed = () => {
  const handleNavigateToLicenseManagement = useLicenseManagementLocatorApi();

  return (
    <EuiPageSection color="danger" alignment="center">
      <EuiEmptyPrompt
        iconType="warning"
        title={
          <h2>
            <FormattedMessage
              id="xpack.csp.subscriptionNotAllowed.promptTitle"
              defaultMessage="Upgrade for subscription features"
            />
          </h2>
        }
        body={
          handleNavigateToLicenseManagement ? (
            <p data-test-subj={'has_locator'}>
              <FormattedMessage
                id="xpack.csp.subscriptionNotAllowed.promptDescription"
                defaultMessage="To use these cloud security features, you must {link}."
                values={{
                  link: (
                    <EuiLink onClick={handleNavigateToLicenseManagement}>
                      <FormattedMessage
                        id="xpack.csp.subscriptionNotAllowed.promptLinkText"
                        defaultMessage="start a trial or upgrade your subscription"
                      />
                    </EuiLink>
                  ),
                }}
              />
            </p>
          ) : (
            <p data-test-subj={'no_locator'}>
              <FormattedMessage
                id="xpack.csp.subscriptionNotAllowed.promptDescriptionNoLocator"
                defaultMessage="Contact your administrator to change your license."
              />
            </p>
          )
        }
      />
    </EuiPageSection>
  );
};
