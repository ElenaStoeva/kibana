/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { FunctionComponent, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import {
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiTitle,
  EuiDescriptionList,
  EuiDescriptionListTitle,
  EuiDescriptionListDescription,
  EuiFlyoutFooter,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButtonEmpty,
  EuiIcon,
  EuiPopover,
  EuiContextMenu,
  EuiButton,
  EuiBetaBadge,
  EuiCodeBlock,
  EuiToolTip,
  EuiButtonIcon,
  EuiText,
  EuiSpacer,
  useEuiTheme,
} from '@elastic/eui';
import { PipelineStructureTree } from '@kbn/ingest-pipelines-shared';

import { useKibana } from '../../../shared_imports';
import { Pipeline } from '../../../../common/types';

import { deprecatedPipelineBadge } from './table';
import { PipelineDetailsJsonBlock } from './details_json_block';
import { stringifyJson } from '../../lib/utils';

export interface Props {
  pipeline: Pipeline;
  onEditClick: (pipelineName: string) => void;
  onCloneClick: (pipelineName: string) => void;
  onDeleteClick: (pipelineName: Pipeline[]) => void;
  onClose: () => void;
}

export const PipelineDetailsFlyout: FunctionComponent<Props> = ({
  pipeline,
  onClose,
  onEditClick,
  onCloneClick,
  onDeleteClick,
}) => {
  const { services } = useKibana();
  const { euiTheme } = useEuiTheme();

  // const { data, isLoading, error, resendRequest } = services.api.useLoadPipelineTree(pipeline.name);
  const data = {
    pipelineName: 'logs_kubernetes.container_logs-1.80.2',
    isManaged: true,
    isDeprecated: true,
    children: [
      {
        pipelineName: 'global@custom',
        isManaged: true,
        isDeprecated: true,
        children: [
          {
            pipelineName: 'pipeline-level-3',
            isManaged: false,
            isDeprecated: false,
            children: [
              {
                pipelineName: 'pipeline-level-4',
                isManaged: false,
                isDeprecated: true,
                children: [
                  {
                    pipelineName: 'pipeline-level-5',
                    isManaged: true,
                    isDeprecated: false,
                    children: [
                      {
                        // This node shouldn't be displayed as it is on level 6
                        pipelineName: 'pipeline-level-6',
                        isManaged: true,
                        isDeprecated: false,
                        children: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        pipelineName: 'logs@custom',
        isManaged: false,
        isDeprecated: true,
        children: [],
      },
      {
        pipelineName: 'logs_kubernetes.container_logs-default',
        isManaged: true,
        isDeprecated: false,
        children: [],
      },
      {
        pipelineName: 'pipeline-level-2',
        isManaged: true,
        isDeprecated: false,
        children: [],
      },
    ],
  };

  const [showPopover, setShowPopover] = useState(false);
  const popoverActions = [
    /**
     * Duplicate pipeline
     */
    {
      name: i18n.translate('xpack.ingestPipelines.list.pipelineDetails.duplicateActionLabel', {
        defaultMessage: 'Duplicate',
      }),
      icon: <EuiIcon type="copy" />,
      onClick: () => onCloneClick(pipeline.name),
    },
    /**
     * Delete pipeline
     */
    {
      name: i18n.translate('xpack.ingestPipelines.list.pipelineDetails.deleteActionLabel', {
        defaultMessage: 'Delete',
      }),
      icon: <EuiIcon type="trash" />,
      'data-test-subj': 'deletePipelineButton',
      onClick: () => {
        setShowPopover(false);
        onDeleteClick([pipeline]);
      },
      css: { color: euiTheme.colors.dangerText },
    },
  ];

  const actionsPopoverButton = (
    <EuiButtonIcon
      display="base"
      size="m"
      data-test-subj="actionsPopoverButton"
      aria-label={i18n.translate(
        'xpack.ingestPipelines.list.pipelineDetails.popoverPipelineActionsAriaLabel',
        {
          defaultMessage: 'Other actions',
        }
      )}
      onClick={() => setShowPopover((previousBool) => !previousBool)}
      iconType="boxesVertical"
    />
  );

  return (
    <EuiFlyout
      onClose={onClose}
      aria-labelledby="pipelineDetailsFlyoutTitle"
      data-test-subj="pipelineDetails"
      size="l"
      maxWidth={1000}
    >
      <EuiFlyoutHeader>
        <EuiFlexGroup direction="row">
          <EuiFlexItem grow={5}>
            <EuiTitle id="pipelineTreeTitle" data-test-subj="pipelineTreeTitle">
              <h2>
                {i18n.translate('xpack.ingestPipelines.list.pipelineDetails.pipelineTreeTitle', {
                  defaultMessage: 'Ingest pipeline structure',
                })}
              </h2>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={5}>
            <EuiTitle id="pipelineDetailsFlyoutTitle" data-test-subj="title">
              <h2>{pipeline.name}</h2>
            </EuiTitle>

            <EuiSpacer size="s" />

            <EuiFlexGroup alignItems="center" gutterSize="m">
              {/* Pipeline version */}
              {pipeline.version && (
                <EuiFlexItem grow={false}>
                  <EuiText color="subdued" size="s">
                    {i18n.translate('xpack.ingestPipelines.list.pipelineDetails.versionTitle', {
                      defaultMessage: 'Version',
                    })}{' '}
                    {String(pipeline.version)}
                  </EuiText>
                </EuiFlexItem>
              )}

              {/* Managed badge*/}
              {pipeline.isManaged && (
                <EuiFlexItem grow={false}>
                  <EuiBetaBadge
                    label={i18n.translate(
                      'xpack.ingestPipelines.list.pipelineDetails.managedBadgeLabel',
                      { defaultMessage: 'Managed' }
                    )}
                    size="s"
                    color="hollow"
                  />
                </EuiFlexItem>
              )}

              {/* Deprecated badge*/}
              {pipeline.deprecated && (
                <EuiFlexItem grow={false}>
                  <EuiToolTip content={deprecatedPipelineBadge.badgeTooltip}>
                    <EuiBetaBadge
                      label={deprecatedPipelineBadge.badge}
                      size="s"
                      color="subdued"
                      data-test-subj="isDeprecatedBadge"
                    />
                  </EuiToolTip>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        <EuiFlexGroup>
          <EuiFlexItem grow={5}>
            <PipelineStructureTree pipelineTree={data} isExtension={false}  />
          </EuiFlexItem>
          <EuiFlexItem grow={5}>
            <EuiDescriptionList rowGutterSize="m" css={{ maxWidth: '500px' }}>
              {/* Pipeline description */}
              {pipeline.description && (
                <>
                  <EuiDescriptionListTitle />
                  <EuiDescriptionListDescription>
                    {pipeline.description}
                  </EuiDescriptionListDescription>
                </>
              )}

              {/* Processors JSON */}
              <EuiDescriptionListTitle>
                {i18n.translate('xpack.ingestPipelines.list.pipelineDetails.processorsTitle', {
                  defaultMessage: 'Processors',
                })}
              </EuiDescriptionListTitle>
              <EuiDescriptionListDescription>
                <PipelineDetailsJsonBlock json={pipeline.processors} />
              </EuiDescriptionListDescription>

              {/* On Failure Processor JSON */}
              {pipeline.on_failure?.length && (
                <>
                  <EuiDescriptionListTitle>
                    {i18n.translate(
                      'xpack.ingestPipelines.list.pipelineDetails.failureProcessorsTitle',
                      {
                        defaultMessage: 'Failure processors',
                      }
                    )}
                  </EuiDescriptionListTitle>
                  <EuiDescriptionListDescription>
                    <PipelineDetailsJsonBlock json={pipeline.on_failure} />
                  </EuiDescriptionListDescription>
                </>
              )}

              {/* Metadata (optional) */}
              {pipeline._meta && (
                <>
                  <EuiDescriptionListTitle data-test-subj="metaTitle">
                    <FormattedMessage
                      id="xpack.ingestPipelines.list.pipelineDetails.metaDescriptionListTitle"
                      defaultMessage="Metadata"
                    />
                  </EuiDescriptionListTitle>
                  <EuiDescriptionListDescription>
                    <EuiCodeBlock language="json">
                      {stringifyJson(pipeline._meta, false)}
                    </EuiCodeBlock>
                  </EuiDescriptionListDescription>
                </>
              )}
            </EuiDescriptionList>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              iconType="cross"
              onClick={onClose}
              flush="left"
              data-test-subj="closeDetailsFlyout"
            >
              {i18n.translate('xpack.ingestPipelines.list.pipelineDetails.closeButtonLabel', {
                defaultMessage: 'Close',
              })}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexGroup gutterSize="s" alignItems="center" justifyContent="flexEnd">
            <EuiFlexItem grow={false}>
              <EuiButton
                data-test-subj="editPipelineButton"
                aria-label={i18n.translate(
                  'xpack.ingestPipelines.list.pipelineDetails.editPipelineActionsAriaLabel',
                  {
                    defaultMessage: 'Edit pipeline',
                  }
                )}
                onClick={() => onEditClick(pipeline.name)}
              >
                {i18n.translate(
                  'xpack.ingestPipelines.list.pipelineDetails.editPipelineButtonLabel',
                  {
                    defaultMessage: 'Edit pipeline',
                  }
                )}
              </EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiPopover
                isOpen={showPopover}
                closePopover={() => setShowPopover(false)}
                button={actionsPopoverButton}
                panelPaddingSize="none"
                repositionOnScroll
              >
                <EuiContextMenu
                  initialPanelId={0}
                  panels={[
                    {
                      id: 0,
                      items: popoverActions,
                    },
                  ]}
                  css={{ width: '150px' }}
                />
              </EuiPopover>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
