/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import expect from '@kbn/expect';

import { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const retry = getService('retry');
  const kibanaServer = getService('kibanaServer');
  const dashboardPanelActions = getService('dashboardPanelActions');
  const dashboardCustomizePanel = getService('dashboardCustomizePanel');
  const security = getService('security');
  const { dashboard, timePicker } = getPageObjects(['dashboard', 'timePicker']);

  describe('dashboard data-shared attributes', function describeIndexTests() {
    let originalPanelTitles: string[];

    before(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/dashboard/current/kibana'
      );
      await security.testUser.setRoles(['kibana_admin', 'test_logstash_reader', 'animals']);
      await kibanaServer.uiSettings.replace({
        defaultIndex: '0bf35f60-3dc9-11e8-8660-4d65aa086b3c',
      });
      await dashboard.navigateToApp();
      await dashboard.preserveCrossAppState();
      await dashboard.loadSavedDashboard('dashboard with everything');
      await dashboard.waitForRenderComplete();
    });

    after(async () => {
      await security.testUser.restoreDefaults();
      await kibanaServer.savedObjects.cleanStandardList();
    });

    it('should have time picker with data-shared-timefilter-duration', async () => {
      await retry.try(async () => {
        const sharedData = await timePicker.getTimeDurationForSharing();
        expect(sharedData).to.not.be(null);
      });
    });

    it('should have data-shared-items-count set to the number of embeddables on the dashboard', async () => {
      await retry.try(async () => {
        const sharedItemsCount = await dashboard.getSharedItemsCount();
        const panelCount = await dashboard.getPanelCount();
        expect(sharedItemsCount).to.eql(panelCount);
      });
    });

    it('should have panels with expected data-shared-item title', async () => {
      await retry.try(async () => {
        const sharedData = await dashboard.getPanelSharedItemData();
        originalPanelTitles = await dashboard.getPanelTitles();
        expect(sharedData.map((item) => item.title)).to.eql(originalPanelTitles);
      });
    });

    it('data shared item container data has description and title set', async () => {
      const sharedContainerData = await dashboard.getSharedContainerData();
      expect(sharedContainerData.title).to.be('dashboard with everything');
      expect(sharedContainerData.description).to.be(
        'I have one of every visualization type since the last time I was created!'
      );
    });

    it('data-shared-item title should update a viz when using a custom panel title', async () => {
      await dashboard.switchToEditMode();
      const CUSTOM_VIS_TITLE = 'ima custom title for a vis!';
      await dashboardPanelActions.customizePanel();
      await dashboardCustomizePanel.expectCustomizePanelSettingsFlyoutOpen();
      await dashboardCustomizePanel.setCustomPanelTitle(CUSTOM_VIS_TITLE);
      await dashboardCustomizePanel.clickSaveButton();
      await dashboardCustomizePanel.expectCustomizePanelSettingsFlyoutClosed();

      await retry.try(async () => {
        const sharedData = await dashboard.getPanelSharedItemData();
        const foundSharedItemTitle = !!sharedData.find((item) => {
          return item.title === CUSTOM_VIS_TITLE;
        });
        expect(foundSharedItemTitle).to.be(true);
      });
    });

    it('data-shared-item title is cleared with an empty panel title string', async () => {
      const toggleHideTitle = async () => {
        await dashboardPanelActions.customizePanel();
        await dashboardCustomizePanel.expectCustomizePanelSettingsFlyoutOpen();
        await dashboardCustomizePanel.clickToggleHidePanelTitle();
        await dashboardCustomizePanel.clickSaveButton();
        await dashboardCustomizePanel.expectCustomizePanelSettingsFlyoutClosed();
      };
      await toggleHideTitle();

      await retry.try(async () => {
        const sharedData = await dashboard.getPanelSharedItemData();
        const foundSharedItemTitle = !!sharedData.find((item) => {
          return item.title === '';
        });
        expect(foundSharedItemTitle).to.be(true);
      });
      await toggleHideTitle();
    });

    it('data-shared-item title can be reset', async () => {
      await dashboard.switchToEditMode();
      await dashboardPanelActions.customizePanel();
      await dashboardCustomizePanel.resetCustomPanelTitle();
      await dashboardCustomizePanel.clickSaveButton();
      await dashboardCustomizePanel.expectCustomizePanelSettingsFlyoutClosed();

      await retry.try(async () => {
        const sharedData = await dashboard.getPanelSharedItemData();
        const foundOriginalSharedItemTitle = !!sharedData.find((item) => {
          return item.title === originalPanelTitles[0];
        });
        expect(foundOriginalSharedItemTitle).to.be(true);
      });
    });

    it('data-shared-item title should update a saved search when using a custom panel title', async () => {
      await dashboard.switchToEditMode();
      const CUSTOM_SEARCH_TITLE = 'ima custom title for a search!';
      await dashboardPanelActions.customizePanel('Rendering Test: saved search');
      await dashboardCustomizePanel.expectCustomizePanelSettingsFlyoutOpen();
      await dashboardCustomizePanel.setCustomPanelTitle(CUSTOM_SEARCH_TITLE);
      await dashboardCustomizePanel.clickSaveButton();
      await dashboardCustomizePanel.expectCustomizePanelSettingsFlyoutClosed();

      await retry.try(async () => {
        const sharedData = await dashboard.getPanelSharedItemData();
        const foundSharedItemTitle = !!sharedData.find((item) => {
          return item.title === CUSTOM_SEARCH_TITLE;
        });
        expect(foundSharedItemTitle).to.be(true);
      });
    });
  });
}
