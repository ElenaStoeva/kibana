/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { FC, ReactNode } from 'react';
import React from 'react';
import type { RenderHookResult } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { casesPluginMock } from '@kbn/cases-plugin/public/mocks';
import { useCaseDisabled } from './use_case_permission';
import { TestProvidersComponent } from '../../../mocks/test_providers';
import { EMPTY_VALUE } from '../../../constants/common';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';

const casesServiceMock = casesPluginMock.createStartContract();

const getProviderComponent =
  (mockedServices: unknown) =>
  // eslint-disable-next-line react/display-name
  ({ children }: { children: ReactNode }) =>
    (
      <TestProvidersComponent>
        <KibanaContextProvider services={mockedServices as any}>{children}</KibanaContextProvider>
      </TestProvidersComponent>
    );

describe('useCasePermission', () => {
  let hookResult: RenderHookResult<boolean, unknown>;

  it('should return false if user has correct permissions and indicator has a name', () => {
    const mockedServices = {
      cases: {
        ...casesServiceMock,
        helpers: {
          ...casesServiceMock.helpers,
          canUseCases: () => ({
            createComment: true,
            update: true,
          }),
        },
      },
    };
    // @ts-ignore
    const ProviderComponent: FC = getProviderComponent(mockedServices);

    const indicatorName: string = 'abc';

    hookResult = renderHook(() => useCaseDisabled(indicatorName), {
      wrapper: ProviderComponent,
    });
    expect(hookResult.result.current).toEqual(false);
  });

  it(`should return true if user doesn't have correct permissions`, () => {
    const mockedServices = {
      cases: {
        ...casesServiceMock,
        helpers: {
          ...casesServiceMock.helpers,
          canUseCases: () => ({
            createComment: false,
            update: true,
          }),
        },
      },
    };
    // @ts-ignore
    const ProviderComponent: FC = getProviderComponent(mockedServices);

    const indicatorName: string = 'abc';

    hookResult = renderHook(() => useCaseDisabled(indicatorName), {
      wrapper: ProviderComponent,
    });
    expect(hookResult.result.current).toEqual(true);
  });

  it('should return true if indicator name is missing or empty', () => {
    const mockedServices = {
      cases: {
        ...casesServiceMock,
        helpers: {
          ...casesServiceMock.helpers,
          canUseCases: () => ({
            createComment: true,
            update: true,
          }),
        },
      },
    };
    // @ts-ignore
    const ProviderComponent: FC = getProviderComponent(mockedServices);

    const indicatorName: string = EMPTY_VALUE;

    hookResult = renderHook(() => useCaseDisabled(indicatorName), {
      wrapper: ProviderComponent,
    });
    expect(hookResult.result.current).toEqual(true);
  });
});
