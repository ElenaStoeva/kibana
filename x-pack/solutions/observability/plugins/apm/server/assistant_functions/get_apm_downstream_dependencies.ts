/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { FunctionRegistrationParameters } from '.';
import type { RandomSampler } from '../lib/helpers/get_random_sampler';
import { getAssistantDownstreamDependencies } from '../routes/assistant_functions/get_apm_downstream_dependencies';

interface DownstreamDependenciesFunctionRegistrationParams extends FunctionRegistrationParameters {
  randomSampler: RandomSampler;
}

export function registerGetApmDownstreamDependenciesFunction({
  apmEventClient,
  registerFunction,
  randomSampler,
}: DownstreamDependenciesFunctionRegistrationParams) {
  registerFunction(
    {
      name: 'get_apm_downstream_dependencies',
      description: `Get the downstream dependencies (services or uninstrumented backends) for a
      service. This allows you to map the downstream dependency name to a service, by
      returning both span.destination.service.resource and service.name. Use this to
      drilldown further if needed.`,
      descriptionForUser: i18n.translate(
        'xpack.apm.observabilityAiAssistant.functions.registerGetApmDownstreamDependencies.descriptionForUser',
        {
          defaultMessage: `Get the downstream dependencies (services or uninstrumented backends) for a
      service. This allows you to map the dowstream dependency name to a service, by
      returning both span.destination.service.resource and service.name. Use this to
      drilldown further if needed.`,
        }
      ),
      parameters: {
        type: 'object',
        properties: {
          serviceName: {
            type: 'string',
            description: 'The name of the service',
          },
          serviceEnvironment: {
            type: 'string',
            description:
              'The environment that the service is running in. Leave empty to query for all environments.',
          },
          start: {
            type: 'string',
            description: 'The start of the time range, in Elasticsearch date math, like `now`.',
          },
          end: {
            type: 'string',
            description: 'The end of the time range, in Elasticsearch date math, like `now-24h`.',
          },
        },
        required: ['serviceName', 'start', 'end'],
      } as const,
    },
    async ({ arguments: args }, signal) => {
      return {
        content: {
          dependencies: await getAssistantDownstreamDependencies({
            arguments: args,
            apmEventClient,
            randomSampler,
          }),
        },
      };
    }
  );
}
