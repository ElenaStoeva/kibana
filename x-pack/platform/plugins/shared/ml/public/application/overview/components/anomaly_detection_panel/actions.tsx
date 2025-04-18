/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { Action } from '@elastic/eui/src/components/basic_table/action_types';
import { useTimefilter } from '@kbn/ml-date-picker';
import {
  useMlLocator,
  useNavigateToPath,
  useMlManagementLocatorInternal,
} from '../../../contexts/kibana';
import { ML_PAGES } from '../../../../../common/constants/locator';
import type { Group } from './anomaly_detection_panel';

export function useGroupActions(): Array<Action<Group>> {
  const locator = useMlLocator();
  const mlManagementLocator = useMlManagementLocatorInternal();
  const timefilter = useTimefilter();
  const navigateToPath = useNavigateToPath();

  return [
    {
      isPrimary: true,
      name: i18n.translate('xpack.ml.overview.anomalyDetection.viewJobsActionName', {
        defaultMessage: 'View jobs',
      }),
      description: i18n.translate(
        'xpack.ml.overview.anomalyDetection.resultActions.openInJobManagementText',
        {
          defaultMessage: 'View jobs',
        }
      ),
      icon: 'list',
      type: 'icon',
      onClick: async (item) => {
        const { url } = await mlManagementLocator?.getUrl(
          {
            page: ML_PAGES.ANOMALY_DETECTION_JOBS_MANAGE,
            pageState: {
              groupIds: [item.id],
            },
          },
          'anomaly_detection'
        );
        await navigateToPath(url);
      },
    },
    {
      isPrimary: false,
      name: i18n.translate('xpack.ml.overview.anomalyDetection.viewResultsActionName', {
        defaultMessage: 'View in Anomaly Explorer',
      }),
      description: i18n.translate(
        'xpack.ml.overview.anomalyDetection.resultActions.openJobsInAnomalyExplorerText',
        {
          defaultMessage: 'View in Anomaly Explorer',
        }
      ),
      icon: 'visTable',
      type: 'icon',
      onClick: async (item) => {
        const path = await locator?.getUrl({
          page: ML_PAGES.ANOMALY_EXPLORER,
          pageState: {
            timeRange: timefilter.getTime(),
            jobIds: isUngrouped(item) ? item.jobIds : [item.id],
          },
        });
        await navigateToPath(path);
      },
    },
  ];
}

const isUngrouped = (item: Group) => item.id === 'ungrouped';
