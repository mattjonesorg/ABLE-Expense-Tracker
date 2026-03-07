import { useState } from 'react';
import {
  TextInput,
  Textarea,
  NumberInput,
  Select,
  FileInput,
  Button,
  Paper,
  Title,
  Stack,
  Group,
  Text,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useNavigate } from 'react-router-dom';
import { IconSparkles, IconUpload } from '@tabler/icons-react';
import { ABLE_CATEGORIES } from '../lib/types';
import type { AbleCategory } from '../lib/types';
import { createExpense, categorizeExpense } from '../lib/api';

/**
 * Maximum character limits matching backend validation (#41).
 * Exported for use in tests.
 */
export const FIELD_LIMITS = {
  vendor: 200,
  description: 1000,
  paidBy: 100,
} as const;

interface ExpenseFormValues {
  vendor: string;
  description: string;
  amount: number | '';
  date: Date | null;
  paidBy: string;
  category: string | null;
  receipt: File | null;
}

/** Render a character counter like "5/200" below a field */
function CharCounter({ current, max }: { current: number; max: number }) {
  const ratio = current / max;
  const color = ratio >= 0.9 ? 'red' : undefined;
  return (
    <Text size="xs" c={color}>
      {current}/{max}
    </Text>
  );
}

export function ExpenseForm() {
  const navigate = useNavigate();
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ExpenseFormValues>({
    initialValues: {
      vendor: '',
      description: '',
      amount: '',
      date: new Date(),
      paidBy: '',
      category: null,
      receipt: null,
    },
    validate: {
      vendor: (value) => {
        if (value.trim().length === 0) return 'Vendor is required';
        if (value.length > FIELD_LIMITS.vendor)
          return `Vendor must be ${FIELD_LIMITS.vendor} characters or fewer`;
        return null;
      },
      description: (value) => {
        if (value.trim().length === 0) return 'Description is required';
        if (value.length > FIELD_LIMITS.description)
          return `Description must be ${FIELD_LIMITS.description} characters or fewer`;
        return null;
      },
      amount: (value) => {
        if (value === '' || value === undefined || value === null) {
          return 'Amount is required';
        }
        if (typeof value === 'number' && value <= 0) {
          return 'Amount must be greater than zero';
        }
        return null;
      },
      date: (value) => {
        if (!value) {
          return 'Date is required';
        }
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (value > today) {
          return 'Date cannot be in the future';
        }
        return null;
      },
      paidBy: (value) => {
        if (value.trim().length === 0) return 'Paid by is required';
        if (value.length > FIELD_LIMITS.paidBy)
          return `Paid by must be ${FIELD_LIMITS.paidBy} characters or fewer`;
        return null;
      },
    },
  });

  const handleSuggestCategory = async () => {
    const vendor = form.values.vendor;
    const description = form.values.description;

    if (!vendor.trim() && !description.trim()) {
      notifications.show({
        title: 'Missing information',
        message: 'Please enter a vendor and/or description before requesting a category suggestion.',
        color: 'yellow',
      });
      return;
    }

    setIsCategorizing(true);
    try {
      const result = await categorizeExpense({ vendor, description });
      if (result) {
        form.setFieldValue('category', result.suggestedCategory);
      } else {
        notifications.show({
          title: 'No suggestion available',
          message: 'AI could not determine a category. Please select one manually.',
          color: 'yellow',
        });
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to get category suggestion';
      notifications.show({
        title: 'Categorization failed',
        message,
        color: 'red',
      });
    } finally {
      setIsCategorizing(false);
    }
  };

  const handleSubmit = async (values: ExpenseFormValues) => {
    setIsSubmitting(true);
    try {
      // Convert dollars to cents (integer)
      const amountInCents = Math.round((values.amount as number) * 100);

      // Format date as YYYY-MM-DD
      const dateStr = values.date
        ? values.date.toISOString().split('T')[0] ?? ''
        : '';

      const categoryConfidence: 'ai_suggested' | 'user_selected' =
        values.category ? 'user_selected' : 'user_selected';

      await createExpense({
        vendor: values.vendor.trim(),
        description: values.description.trim(),
        amount: amountInCents,
        date: dateStr,
        paidBy: values.paidBy.trim(),
        category: (values.category as AbleCategory) ?? null,
        categoryConfidence,
        receiptFile: values.receipt,
      });

      notifications.show({
        title: 'Expense created',
        message: 'Your expense has been recorded successfully.',
        color: 'green',
      });

      navigate('/expenses');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to create expense';
      notifications.show({
        title: 'Error',
        message,
        color: 'red',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const categoryOptions = ABLE_CATEGORIES.map((cat) => ({
    value: cat,
    label: cat,
  }));

  return (
    <Stack gap="lg">
      <Title order={1}>New Expense</Title>

      <Paper withBorder shadow="sm" p="xl" radius="md">
        <form onSubmit={form.onSubmit(handleSubmit)} aria-label="New expense form">
          <Stack gap="md">
            <TextInput
              label="Vendor"
              placeholder="e.g., University Bookstore"
              withAsterisk
              aria-required="true"
              maxLength={FIELD_LIMITS.vendor}
              description={
                <CharCounter
                  current={form.values.vendor.length}
                  max={FIELD_LIMITS.vendor}
                />
              }
              {...form.getInputProps('vendor')}
            />

            <Textarea
              label="Description"
              placeholder="Describe the expense"
              withAsterisk
              aria-required="true"
              minRows={3}
              maxLength={FIELD_LIMITS.description}
              description={
                <CharCounter
                  current={form.values.description.length}
                  max={FIELD_LIMITS.description}
                />
              }
              {...form.getInputProps('description')}
            />

            <NumberInput
              label="Amount"
              placeholder="0.00"
              withAsterisk
              aria-required="true"
              prefix="$"
              decimalScale={2}
              fixedDecimalScale
              min={0}
              {...form.getInputProps('amount')}
            />

            <DateInput
              label="Date"
              placeholder="Select date"
              withAsterisk
              aria-required="true"
              maxDate={new Date()}
              {...form.getInputProps('date')}
            />

            <TextInput
              label="Paid By"
              placeholder="Who paid out-of-pocket?"
              withAsterisk
              aria-required="true"
              maxLength={FIELD_LIMITS.paidBy}
              description={
                <CharCounter
                  current={form.values.paidBy.length}
                  max={FIELD_LIMITS.paidBy}
                />
              }
              {...form.getInputProps('paidBy')}
            />

            <Group align="end" gap="sm">
              <Select
                label="Category"
                placeholder="Select or let AI suggest"
                data={categoryOptions}
                clearable
                searchable
                style={{ flex: 1 }}
                {...form.getInputProps('category')}
              />
              <Button
                variant="light"
                leftSection={<IconSparkles size={16} aria-hidden="true" />}
                onClick={handleSuggestCategory}
                loading={isCategorizing}
              >
                Suggest Category
              </Button>
            </Group>

            <FileInput
              label="Receipt"
              placeholder="Upload receipt (optional)"
              accept="image/*,application/pdf"
              leftSection={<IconUpload size={16} aria-hidden="true" />}
              clearable
              {...form.getInputProps('receipt')}
            />

            <Button
              type="submit"
              fullWidth
              mt="md"
              loading={isSubmitting}
            >
              Create Expense
            </Button>
          </Stack>
        </form>
      </Paper>
    </Stack>
  );
}
