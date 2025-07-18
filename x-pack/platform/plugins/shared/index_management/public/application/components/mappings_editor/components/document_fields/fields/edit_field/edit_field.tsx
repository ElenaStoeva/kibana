/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiTitle,
  EuiButton,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiCallOut,
  EuiText,
  EuiToolTip,
  EuiIcon,
  EuiTextColor,
} from '@elastic/eui';
import SemVer from 'semver/classes/semver';

import { useFormIsModified } from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import { documentationService } from '../../../../../../services/documentation';
import { Form, FormHook, FormDataProvider } from '../../../../shared_imports';
import { TYPE_DEFINITION } from '../../../../constants';
import { Field, NormalizedField, NormalizedFields, MainType, SubType } from '../../../../types';
import { CodeBlock } from '../../../code_block';
import { getParametersFormForType } from '../field_types';
import { UpdateFieldFunc } from './use_update_field';
import { EditFieldHeaderForm } from './edit_field_header_form';

const limitStringLength = (text: string, limit = 18): string => {
  if (text.length <= limit) {
    return text;
  }

  return `...${text.substr(limit * -1)}`;
};

export interface Props {
  form: FormHook<Field>;
  field: NormalizedField;
  allFields: NormalizedFields['byId'];
  exitEdit(): void;
  updateField: UpdateFieldFunc;
  kibanaVersion: SemVer;
}

// The default FormWrapper is the <EuiForm />, which wraps the form with
// a <div>. We can't have a div as first child of the Flyout as it breaks
// the height calculation and does not render the footer position correctly.
const FormWrapper: React.FC<{ children?: React.ReactNode }> = ({ children }) => <>{children}</>;

export const EditField = React.memo(
  ({ form, field, allFields, exitEdit, updateField, kibanaVersion }: Props) => {
    const submitForm = async () => {
      const { isValid, data } = await form.submit();

      if (isValid) {
        updateField({ ...field, source: data });
      }
    };

    const { isMultiField } = field;

    const isFormModified = useFormIsModified({ form });

    return (
      <Form form={form} FormWrapper={FormWrapper}>
        <EuiFlyoutHeader>
          <EuiFlexGroup gutterSize="xs">
            <EuiFlexItem>
              {/* We need an extra div to get out of flex grow */}
              <div>
                {/* Title */}
                <EuiTitle size="m">
                  <h2 data-test-subj="flyoutTitle">
                    {isMultiField
                      ? i18n.translate('xpack.idxMgmt.mappingsEditor.editMultiFieldTitle', {
                          defaultMessage: "Edit multi-field ''{fieldName}''",
                          values: {
                            fieldName: limitStringLength(field.source.name),
                          },
                        })
                      : i18n.translate('xpack.idxMgmt.mappingsEditor.editFieldTitle', {
                          defaultMessage: "Edit field ''{fieldName}''",
                          values: {
                            fieldName: limitStringLength(field.source.name),
                          },
                        })}
                  </h2>
                </EuiTitle>
              </div>
            </EuiFlexItem>

            {/* Documentation link */}
            <FormDataProvider pathsToWatch={['type', 'subType']}>
              {({ type, subType }) => {
                const linkDocumentation =
                  documentationService.getTypeDocLink(subType?.[0]?.value) ||
                  documentationService.getTypeDocLink(type?.[0]?.value);

                if (!linkDocumentation) {
                  return null;
                }

                const typeDefinition = TYPE_DEFINITION[type?.[0]?.value as MainType];
                const subTypeDefinition = TYPE_DEFINITION[subType?.[0]?.value as SubType];

                return (
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty
                      size="s"
                      flush="right"
                      href={linkDocumentation}
                      target="_blank"
                      iconType="question"
                      data-test-subj="documentationLink"
                    >
                      {i18n.translate('xpack.idxMgmt.mappingsEditor.editField.typeDocumentation', {
                        defaultMessage: '{type} documentation',
                        values: {
                          type: subTypeDefinition ? subTypeDefinition.label : typeDefinition.label,
                        },
                      })}
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                );
              }}
            </FormDataProvider>
          </EuiFlexGroup>

          {/* Field path */}
          <EuiFlexGroup>
            <EuiFlexItem grow={false} data-test-subj="fieldPath">
              <CodeBlock padding="small">{field.path.join(' > ')}</CodeBlock>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutHeader>

        <EuiFlyoutBody>
          <EditFieldHeaderForm
            defaultValue={field.source}
            isRootLevelField={field.parentId === undefined}
            isMultiField={isMultiField}
          />

          <FormDataProvider pathsToWatch={['type', 'subType']}>
            {({ type, subType }) => {
              const ParametersForm = getParametersFormForType(
                type?.[0]?.value,
                subType?.[0]?.value
              );

              if (!ParametersForm) {
                return null;
              }

              return (
                <ParametersForm
                  // As the component "ParametersForm" does not change when switching type, and all the props
                  // also remain the same (===), adding a key give us *a new instance* each time we change the type or subType.
                  // This will trigger an unmount of all the previous form fields and then mount the new ones.
                  key={subType ?? type}
                  field={field}
                  allFields={allFields}
                  isMultiField={isMultiField}
                  kibanaVersion={kibanaVersion}
                />
              );
            }}
          </FormDataProvider>
        </EuiFlyoutBody>

        <EuiFlyoutFooter>
          {form.isSubmitted && !form.isValid && (
            <>
              <EuiCallOut
                title={i18n.translate(
                  'xpack.idxMgmt.mappingsEditor.editFieldFlyout.validationErrorTitle',
                  {
                    defaultMessage: 'Fix errors in form before continuing.',
                  }
                )}
                color="danger"
                iconType="cross"
                data-test-subj="formError"
              />
              <EuiSpacer size="m" />
            </>
          )}

          <EuiFlexGroup justifyContent="flexEnd" alignItems="center">
            {isFormModified && (
              <>
                <EuiFlexItem>
                  <EuiText size="s">
                    <p>
                      <EuiToolTip
                        content={i18n.translate(
                          'xpack.idxMgmt.mappingsEditor.editFieldFlyout.formCompletionTooltip',
                          {
                            defaultMessage:
                              "Default settings are applied to the settings that you haven't changed.",
                          }
                        )}
                        position="top"
                      >
                        <span>
                          <EuiTextColor color="subdued">
                            {i18n.translate(
                              'xpack.idxMgmt.mappingsEditor.editFieldFlyout.formCompletionGuide',
                              {
                                defaultMessage: 'Review all settings before updating ',
                              }
                            )}
                          </EuiTextColor>
                          <EuiIcon type="question" />
                        </span>
                      </EuiToolTip>
                    </p>
                  </EuiText>
                </EuiFlexItem>
              </>
            )}
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty onClick={exitEdit}>
                {i18n.translate('xpack.idxMgmt.mappingsEditor.editFieldCancelButtonLabel', {
                  defaultMessage: 'Cancel',
                })}
              </EuiButtonEmpty>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                fill
                onClick={submitForm}
                type="submit"
                disabled={(form.isSubmitted && !form.isValid) || !isFormModified}
                data-test-subj="editFieldUpdateButton"
              >
                {i18n.translate('xpack.idxMgmt.mappingsEditor.editFieldUpdateButtonLabel', {
                  defaultMessage: 'Update',
                })}
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutFooter>
      </Form>
    );
  }
);
