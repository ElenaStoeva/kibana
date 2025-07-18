/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { render } from '@testing-library/react';
import { InvestigationGuide } from './investigation_guide';
import { DocumentDetailsContext } from '../../shared/context';
import {
  INVESTIGATION_GUIDE_BUTTON_TEST_ID,
  INVESTIGATION_GUIDE_LOADING_TEST_ID,
  INVESTIGATION_GUIDE_TEST_ID,
} from './test_ids';
import { mockContextValue } from '../../shared/mocks/mock_context';
import { useInvestigationGuide } from '../../shared/hooks/use_investigation_guide';
import { useNavigateToLeftPanel } from '../../shared/hooks/use_navigate_to_left_panel';

jest.mock('../../shared/hooks/use_investigation_guide');
jest.mock('../../shared/hooks/use_navigate_to_left_panel');

const mockNavigateToLeftPanel = jest.fn();

const NO_DATA_MESSAGE = "Investigation guideThere's no investigation guide for this rule.";
const PREVIEW_MESSAGE = 'Investigation guide is not available in alert preview.';
const OPEN_FLYOUT_MESSAGE =
  'Investigation guide availableOpen alert details to access investigation guides.';

const renderInvestigationGuide = () =>
  render(
    <IntlProvider locale="en">
      <DocumentDetailsContext.Provider value={mockContextValue}>
        <InvestigationGuide />
      </DocumentDetailsContext.Provider>
    </IntlProvider>
  );

describe('<InvestigationGuide />', () => {
  beforeEach(() => {
    jest.mocked(useNavigateToLeftPanel).mockReturnValue({
      navigateToLeftPanel: mockNavigateToLeftPanel,
      isEnabled: true,
    });
  });

  it('should render investigation guide button correctly', () => {
    (useInvestigationGuide as jest.Mock).mockReturnValue({
      loading: false,
      error: false,
      basicAlertData: { ruleId: 'ruleId' },
      ruleNote: 'test note',
    });
    const { getByTestId, queryByTestId } = renderInvestigationGuide();
    expect(getByTestId(INVESTIGATION_GUIDE_TEST_ID)).toBeInTheDocument();
    expect(getByTestId(INVESTIGATION_GUIDE_BUTTON_TEST_ID)).toBeInTheDocument();
    expect(getByTestId(INVESTIGATION_GUIDE_BUTTON_TEST_ID)).toHaveTextContent(
      'Show investigation guide'
    );
    expect(queryByTestId(INVESTIGATION_GUIDE_LOADING_TEST_ID)).not.toBeInTheDocument();
    expect(getByTestId(INVESTIGATION_GUIDE_TEST_ID)).not.toHaveTextContent(NO_DATA_MESSAGE);
  });

  it('should render loading', () => {
    (useInvestigationGuide as jest.Mock).mockReturnValue({
      loading: true,
    });
    const { getByTestId, queryByTestId } = renderInvestigationGuide();
    expect(getByTestId(INVESTIGATION_GUIDE_TEST_ID)).toBeInTheDocument();
    expect(getByTestId(INVESTIGATION_GUIDE_LOADING_TEST_ID)).toBeInTheDocument();
    expect(queryByTestId(INVESTIGATION_GUIDE_BUTTON_TEST_ID)).not.toBeInTheDocument();
    expect(getByTestId(INVESTIGATION_GUIDE_TEST_ID)).not.toHaveTextContent(NO_DATA_MESSAGE);
  });

  it('should render no data message when there is no ruleId', () => {
    (useInvestigationGuide as jest.Mock).mockReturnValue({
      basicAlertData: {},
      ruleNote: 'test note',
    });
    const { queryByTestId, getByTestId } = renderInvestigationGuide();
    expect(queryByTestId(INVESTIGATION_GUIDE_BUTTON_TEST_ID)).not.toBeInTheDocument();
    expect(getByTestId(INVESTIGATION_GUIDE_TEST_ID)).toHaveTextContent(NO_DATA_MESSAGE);
  });

  it('should render no data message when there is no rule note', () => {
    (useInvestigationGuide as jest.Mock).mockReturnValue({
      basicAlertData: { ruleId: 'ruleId' },
      ruleNote: undefined,
    });
    const { getByTestId, queryByTestId } = renderInvestigationGuide();
    expect(queryByTestId(INVESTIGATION_GUIDE_BUTTON_TEST_ID)).not.toBeInTheDocument();
    expect(getByTestId(INVESTIGATION_GUIDE_TEST_ID)).toHaveTextContent(NO_DATA_MESSAGE);
  });

  it('should render no data message when useInvestigationGuide errors out', () => {
    (useInvestigationGuide as jest.Mock).mockReturnValue({
      loading: false,
      error: true,
    });

    const { queryByTestId, getByTestId } = renderInvestigationGuide();
    expect(queryByTestId(INVESTIGATION_GUIDE_BUTTON_TEST_ID)).not.toBeInTheDocument();
    expect(getByTestId(INVESTIGATION_GUIDE_TEST_ID)).toHaveTextContent(NO_DATA_MESSAGE);
  });

  it('should render preview message when flyout is in preview', () => {
    (useInvestigationGuide as jest.Mock).mockReturnValue({
      loading: false,
      error: false,
      basicAlertData: { ruleId: 'ruleId' },
      ruleNote: 'test note',
    });
    const { queryByTestId, getByTestId } = render(
      <IntlProvider locale="en">
        <DocumentDetailsContext.Provider value={{ ...mockContextValue, isRulePreview: true }}>
          <InvestigationGuide />
        </DocumentDetailsContext.Provider>
      </IntlProvider>
    );

    expect(queryByTestId(INVESTIGATION_GUIDE_BUTTON_TEST_ID)).not.toBeInTheDocument();
    expect(getByTestId(INVESTIGATION_GUIDE_TEST_ID)).toHaveTextContent(PREVIEW_MESSAGE);
  });

  it('should render open flyout message if navigation is disabled', () => {
    (useNavigateToLeftPanel as jest.Mock).mockReturnValue({
      navigateToLeftPanel: undefined,
      isEnabled: false,
    });
    const { queryByTestId, getByTestId } = render(
      <IntlProvider locale="en">
        <DocumentDetailsContext.Provider value={mockContextValue}>
          <InvestigationGuide />
        </DocumentDetailsContext.Provider>
      </IntlProvider>
    );

    expect(queryByTestId(INVESTIGATION_GUIDE_BUTTON_TEST_ID)).not.toBeInTheDocument();
    expect(getByTestId(INVESTIGATION_GUIDE_TEST_ID)).toHaveTextContent(OPEN_FLYOUT_MESSAGE);
  });

  it('should navigate to investigation guide when clicking on button', () => {
    (useInvestigationGuide as jest.Mock).mockReturnValue({
      loading: false,
      error: false,
      basicAlertData: { ruleId: 'ruleId' },
      ruleNote: 'test note',
    });

    const { getByTestId } = renderInvestigationGuide();
    getByTestId(INVESTIGATION_GUIDE_BUTTON_TEST_ID).click();

    expect(mockNavigateToLeftPanel).toHaveBeenCalled();
  });
});
