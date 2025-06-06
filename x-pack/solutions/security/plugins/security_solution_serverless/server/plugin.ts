/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  PluginInitializerContext,
  Plugin,
  CoreSetup,
  CoreStart,
  Logger,
} from '@kbn/core/server';

import { SECURITY_PROJECT_SETTINGS } from '@kbn/serverless-security-settings';
import { isSupportedConnector } from '@kbn/inference-common';
import { getDefaultAIConnectorSetting } from '@kbn/security-solution-plugin/server/ui_settings';
import type { Connector } from '@kbn/actions-plugin/server/application/connector/types';
import { getEnabledProductFeatures } from '../common/pli/pli_features';

import type { ServerlessSecurityConfig } from './config';
import { createConfig } from './config';
import type {
  SecuritySolutionServerlessPluginSetup,
  SecuritySolutionServerlessPluginStart,
  SecuritySolutionServerlessPluginSetupDeps,
  SecuritySolutionServerlessPluginStartDeps,
} from './types';
import { SecurityUsageReportingTask } from './task_manager/usage_reporting_task';
import { cloudSecurityMetringTaskProperties } from './cloud_security/cloud_security_metering_task_config';
import { registerProductFeatures, getSecurityAiSocProductTier } from './product_features';
import { METERING_TASK as ENDPOINT_METERING_TASK } from './endpoint/constants/metering';
import { METERING_TASK as AI4SOC_METERING_TASK } from './ai4soc/constants/metering';
import {
  endpointMeteringService,
  setEndpointPackagePolicyServerlessBillingFlags,
} from './endpoint/services';
import { NLPCleanupTask } from './task_manager/nlp_cleanup_task/nlp_cleanup_task';
import { telemetryEvents } from './telemetry/event_based_telemetry';
import { UsageReportingService } from './common/services/usage_reporting_service';
import { ai4SocMeteringService } from './ai4soc/services';

export class SecuritySolutionServerlessPlugin
  implements
    Plugin<
      SecuritySolutionServerlessPluginSetup,
      SecuritySolutionServerlessPluginStart,
      SecuritySolutionServerlessPluginSetupDeps,
      SecuritySolutionServerlessPluginStartDeps
    >
{
  private kibanaVersion: string;
  private config: ServerlessSecurityConfig;
  private cloudSecurityUsageReportingTask: SecurityUsageReportingTask | undefined;
  private endpointUsageReportingTask: SecurityUsageReportingTask | undefined;
  private ai4SocUsageReportingTask: SecurityUsageReportingTask | undefined;
  private nlpCleanupTask: NLPCleanupTask | undefined;
  private readonly logger: Logger;
  private readonly usageReportingService: UsageReportingService;

  constructor(private readonly initializerContext: PluginInitializerContext) {
    this.kibanaVersion = initializerContext.env.packageInfo.version;
    this.config = this.initializerContext.config.get<ServerlessSecurityConfig>();
    this.logger = this.initializerContext.logger.get();

    this.usageReportingService = new UsageReportingService(
      this.config.usageApi,
      this.kibanaVersion
    );

    const productTypesStr = JSON.stringify(this.config.productTypes, null, 2);
    this.logger.info(`Security Solution running with product types:\n${productTypesStr}`);
  }

  public setup(
    coreSetup: CoreSetup<SecuritySolutionServerlessPluginStartDeps>,
    pluginsSetup: SecuritySolutionServerlessPluginSetupDeps
  ) {
    this.config = createConfig(this.initializerContext, pluginsSetup.securitySolution);

    // Register product features
    const enabledProductFeatures = getEnabledProductFeatures(this.config.productTypes);

    registerProductFeatures(pluginsSetup, enabledProductFeatures, this.config);

    // Register telemetry events
    telemetryEvents.forEach((eventConfig) => coreSetup.analytics.registerEventType(eventConfig));

    // Setup project uiSettings whitelisting
    pluginsSetup.serverless.setupProjectSettings(SECURITY_PROJECT_SETTINGS);

    // use metering check which verifies AI4SOC is enabled
    if (ai4SocMeteringService.shouldMeter(this.config)) {
      // Serverless Advanced Settings setup
      coreSetup
        .getStartServices()
        .then(async ([_, depsStart]) => {
          try {
            const unsecuredActionsClient = depsStart.actions.getUnsecuredActionsClient();
            // using "default" space actually forces the api to use undefined space (see getAllUnsecured)
            const aiConnectors = (await unsecuredActionsClient.getAll('default')).filter(
              (connector: Connector) => isSupportedConnector(connector)
            );
            const defaultAIConnectorSetting = getDefaultAIConnectorSetting(aiConnectors);
            if (defaultAIConnectorSetting !== null) {
              coreSetup.uiSettings.register(defaultAIConnectorSetting);
            }
          } catch (error) {
            this.logger.error(`Error registering default AI connector: ${error}`);
          }
        })
        .catch(() => {}); // it shouldn't reject, but just in case
    }

    // Tasks
    this.cloudSecurityUsageReportingTask = new SecurityUsageReportingTask({
      core: coreSetup,
      logFactory: this.initializerContext.logger,
      config: this.config,
      taskManager: pluginsSetup.taskManager,
      cloudSetup: pluginsSetup.cloud,
      taskType: cloudSecurityMetringTaskProperties.taskType,
      taskTitle: cloudSecurityMetringTaskProperties.taskTitle,
      version: cloudSecurityMetringTaskProperties.version,
      meteringCallback: cloudSecurityMetringTaskProperties.meteringCallback,
      usageReportingService: this.usageReportingService,
    });

    this.endpointUsageReportingTask = new SecurityUsageReportingTask({
      core: coreSetup,
      logFactory: this.initializerContext.logger,
      config: this.config,
      taskType: ENDPOINT_METERING_TASK.TYPE,
      taskTitle: ENDPOINT_METERING_TASK.TITLE,
      version: ENDPOINT_METERING_TASK.VERSION,
      meteringCallback: endpointMeteringService.getUsageRecords,
      taskManager: pluginsSetup.taskManager,
      cloudSetup: pluginsSetup.cloud,
      usageReportingService: this.usageReportingService,
    });

    this.ai4SocUsageReportingTask = new SecurityUsageReportingTask({
      core: coreSetup,
      logFactory: this.initializerContext.logger,
      config: this.config,
      taskType: AI4SOC_METERING_TASK.TYPE,
      taskTitle: AI4SOC_METERING_TASK.TITLE,
      version: AI4SOC_METERING_TASK.VERSION,
      meteringCallback: ai4SocMeteringService.getUsageRecords,
      taskManager: pluginsSetup.taskManager,
      cloudSetup: pluginsSetup.cloud,
      usageReportingService: this.usageReportingService,
      backfillConfig: {
        enabled: true,
        maxRecords: AI4SOC_METERING_TASK.MAX_BACKFILL_RECORDS,
      },
    });

    this.nlpCleanupTask = new NLPCleanupTask({
      core: coreSetup,
      logFactory: this.initializerContext.logger,
      productTier: getSecurityAiSocProductTier(this.config, this.logger),
      taskManager: pluginsSetup.taskManager,
    });

    return {};
  }

  public start(coreStart: CoreStart, pluginsSetup: SecuritySolutionServerlessPluginStartDeps) {
    const internalESClient = coreStart.elasticsearch.client.asInternalUser;
    const internalSOClient = coreStart.savedObjects.createInternalRepository();

    this.cloudSecurityUsageReportingTask
      ?.start({
        taskManager: pluginsSetup.taskManager,
        interval: this.config.cloudSecurityUsageReportingTaskInterval,
      })
      .catch(() => {});

    this.endpointUsageReportingTask
      ?.start({
        taskManager: pluginsSetup.taskManager,
        interval: this.config.usageReportingTaskInterval,
      })
      .catch(() => {});

    if (ai4SocMeteringService.shouldMeter(this.config)) {
      this.ai4SocUsageReportingTask
        ?.start({
          taskManager: pluginsSetup.taskManager,
          interval: this.config.ai4SocUsageReportingTaskInterval,
        })
        .catch(() => {});
    }

    this.nlpCleanupTask?.start({ taskManager: pluginsSetup.taskManager }).catch(() => {});

    setEndpointPackagePolicyServerlessBillingFlags(
      internalSOClient,
      internalESClient,
      pluginsSetup.fleet.packagePolicyService
    ).catch(() => {});
    return {};
  }

  public stop() {}
}
