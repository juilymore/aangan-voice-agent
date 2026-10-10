import { EmptyState, GlassCard, ButtonLink } from "@/components/ui";
import { PhoneIcon } from "@/components/icons";

export default function CallNotFound() {
  return (
    <GlassCard className="mx-auto mt-6 max-w-lg">
      <EmptyState icon={PhoneIcon} title="Call not found" action={<ButtonLink href="/calls">Back to calls</ButtonLink>}>
        This call may have been removed after the retention period, or the link is incomplete.
      </EmptyState>
    </GlassCard>
  );
}
