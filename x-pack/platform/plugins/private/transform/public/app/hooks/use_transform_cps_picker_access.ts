/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback } from 'react';
import { ProjectRoutingAccess, useCpsPickerAccess } from '@kbn/cps-utils';
import { SECTION_SLUG } from '../common/constants';
import { useAppDependencies } from '../app_dependencies';

export const getTransformCpsPickerAccess = (location: string): ProjectRoutingAccess => {
  if (location.includes(`/${SECTION_SLUG.CREATE_TRANSFORM}`)) {
    return ProjectRoutingAccess.READONLY;
  }

  return ProjectRoutingAccess.DISABLED;
};

export const useTransformCpsPickerAccess = () => {
  const { application, cps } = useAppDependencies();

  const resolver = useCallback(getTransformCpsPickerAccess, []);

  useCpsPickerAccess({
    resolver,
    currentAppId$: application.currentAppId$,
    cpsManager: cps?.cpsManager,
  });
};
