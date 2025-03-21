/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { transparentize } from '@elastic/eui';
import { CSSObject } from '@emotion/react';
import { useEuiTheme } from '../../hooks';

interface StylesDeps {
  isInvestigated: boolean;
  isSelected: boolean;
}

export const useStyles = ({ isInvestigated, isSelected }: StylesDeps) => {
  const { euiTheme } = useEuiTheme();

  const cached = useMemo(() => {
    const { size, colors, font, border } = euiTheme;

    const getHighlightColors = () => {
      let bgColor = 'none';
      let hoverBgColor = `${transparentize(colors.primary, 0.04)}`; // TODO: Borealis migration - replace transparentize with color token

      if (isInvestigated && isSelected) {
        bgColor = `${transparentize(colors.danger, 0.08)}`; // TODO: Borealis migration - replace transparentize with color token
        hoverBgColor = `${transparentize(colors.danger, 0.12)}`; // TODO: Borealis migration - replace transparentize with color token
      } else if (isInvestigated) {
        bgColor = `${transparentize(colors.danger, 0.04)}`; // TODO: Borealis migration - replace transparentize with color token
        hoverBgColor = `${transparentize(colors.danger, 0.12)}`; // TODO: Borealis migration - replace transparentize with color token
      } else if (isSelected) {
        bgColor = `${transparentize(colors.primary, 0.08)}`; // TODO: Borealis migration - replace transparentize with color token
        hoverBgColor = `${transparentize(colors.primary, 0.12)}`; // TODO: Borealis migration - replace transparentize with color token
      }

      return { bgColor, hoverBgColor };
    };

    const { bgColor, hoverBgColor } = getHighlightColors();

    const alert: CSSObject = {
      fontFamily: font.family,
      padding: `0 ${size.m}`,
      cursor: 'pointer',
      '&:not(:last-child)': {
        marginBottom: size.s,
      },
      background: bgColor,
      '&:hover': {
        background: hoverBgColor,
      },
      '&& button': {
        flexShrink: 0,
        marginRight: size.xs,
        '&:hover, &:focus, &:focus-within': {
          backgroundColor: transparentize(euiTheme.colors.backgroundFilledPrimary, 0.2), // TODO: Borealis migration - replace transparentize with color token
        },
      },
      '&& .euiFlexItem': {
        marginTop: size.xxs,
        marginBottom: size.xxs,
      },
    };

    const alertStatus: CSSObject = {
      textTransform: 'capitalize',
    };

    const processAlertDisplayContainer: CSSObject = {
      display: 'flex',
      alignItems: 'center',
    };

    const alertName: CSSObject = {
      color: colors.title,
      '& .alertCategoryDetailText': {
        fontSize: size.m,
      },
    };

    const actionBadge: CSSObject = {
      textTransform: 'capitalize',
    };

    const processPanel: CSSObject = {
      marginLeft: '8px',
      border: `${border.width.thin} solid ${colors.lightShade}`,
      fontFamily: font.familyCode,
      padding: `${size.xs} ${size.s}`,
    };

    return {
      alert,
      alertStatus,
      alertName,
      actionBadge,
      processPanel,
      processAlertDisplayContainer,
    };
  }, [euiTheme, isInvestigated, isSelected]);

  return cached;
};
