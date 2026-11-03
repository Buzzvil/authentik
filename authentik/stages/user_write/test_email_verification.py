"""Native flow regressions for conditional email proof writes."""

from unittest.mock import patch
from uuid import uuid4

from django.urls import reverse

from authentik.core.models import Group, User
from authentik.core.tests.utils import create_test_flow, create_test_user
from authentik.flows.markers import StageMarker
from authentik.flows.models import FlowStageBinding
from authentik.flows.planner import PLAN_CONTEXT_PENDING_USER, FlowPlan
from authentik.flows.tests import FlowTestCase
from authentik.flows.tests.test_executor import TO_STAGE_RESPONSE_MOCK
from authentik.stages.prompt.stage import PLAN_CONTEXT_PROMPT
from authentik.stages.user_write.api import UserWriteStageSerializer
from authentik.stages.user_write.models import UserCreationMode, UserWriteStage


class TestConditionalEmailVerification(FlowTestCase):
    """Execute stale session plans against the current native user row."""

    attribute = "verified_email"

    def setUp(self):
        super().setUp()
        self.flow = create_test_flow()
        self.stage = UserWriteStage.objects.create(
            name="conditional-email",
            user_creation_mode=UserCreationMode.NEVER_CREATE,
            email_verification_attribute=self.attribute,
        )
        self.binding = FlowStageBinding.objects.create(target=self.flow, stage=self.stage, order=0)
        self.user = create_test_user(email="test@goauthentik.io", attributes={"unrelated": "old"})

    def queue(self, proof, **extra):
        plan = FlowPlan(flow_pk=self.flow.pk.hex, bindings=[self.binding], markers=[StageMarker()])
        plan.context[PLAN_CONTEXT_PENDING_USER] = self.user
        plan.context[PLAN_CONTEXT_PROMPT] = {"attributes": {self.attribute: proof}, **extra}
        self.set_flow_plan(plan)

    def execute(self, denied=False):
        with patch("authentik.flows.views.executor.to_stage_response", TO_STAGE_RESPONSE_MOCK):
            response = self.client.get(
                reverse("authentik_api:flow-executor", kwargs={"flow_slug": self.flow.slug})
            )
        if denied:
            self.assertStageResponse(response, self.flow, component="ak-stage-access-denied")
        else:
            self.assertEqual(response.status_code, 302)
            self.assertEqual(response["Location"], reverse("authentik_core:root-redirect"))

    def test_current_profile_and_unrelated_attributes_survive(self):
        """A stale plan must not undo later profile/attribute writes."""
        self.queue(self.user.email)
        User.objects.filter(pk=self.user.pk).update(
            name="current-name",
            path="current-path",
            attributes={"unrelated": "new", "nested": {"keep": True}},
        )
        self.execute()
        self.user.refresh_from_db()
        self.assertEqual(self.user.name, "current-name")
        self.assertEqual(self.user.path, "current-path")
        self.assertEqual(
            self.user.attributes,
            {"unrelated": "new", "nested": {"keep": True}, self.attribute: self.user.email},
        )

    def test_current_active_and_email_are_required(self):
        """Updates between source callback and execution fail closed."""
        email = self.user.email
        for updates in ({"is_active": False}, {"email": "changed@goauthentik.io"}):
            with self.subTest(updates=updates):
                User.objects.filter(pk=self.user.pk).update(is_active=True, email=email)
                self.user.refresh_from_db()
                self.queue(email)
                User.objects.filter(pk=self.user.pk).update(**updates)
                self.execute(denied=True)
                self.user.refresh_from_db()
                for key, value in updates.items():
                    self.assertEqual(getattr(self.user, key), value)
                self.assertNotIn(self.attribute, self.user.attributes)

    def test_missing_or_replaced_identity_is_not_recreated(self):
        self.queue(self.user.email)
        pk = self.user.pk
        self.user.delete()
        self.execute(denied=True)
        self.assertFalse(User.objects.filter(pk=pk).exists())
        self.user = create_test_user()
        self.queue(self.user.email)
        replacement_uuid = uuid4()
        User.objects.filter(pk=self.user.pk).update(uuid=replacement_uuid)
        self.execute(denied=True)
        self.user.refresh_from_db()
        self.assertEqual(self.user.uuid, replacement_uuid)
        self.assertNotIn(self.attribute, self.user.attributes)

    def test_unknown_or_inactive_snapshot_is_denied(self):
        for active in (False, None):
            with self.subTest(active=active):
                self.user.refresh_from_db()
                self.user.is_active = active
                self.queue(self.user.email)
                self.execute(denied=True)
                self.user.refresh_from_db()
                self.assertTrue(self.user.is_active)
                self.assertNotIn(self.attribute, self.user.attributes)

    def test_unusable_proof_clears_only_current_proof_key(self):
        for proof in ("", None, False, True, [], {}, "different@goauthentik.io"):
            with self.subTest(proof=proof):
                self.user.refresh_from_db()
                self.queue(proof)
                User.objects.filter(pk=self.user.pk).update(
                    attributes={self.attribute: self.user.email, "unrelated": "new"}
                )
                self.execute()
                self.user.refresh_from_db()
                self.assertEqual(self.user.attributes, {"unrelated": "new"})

    def test_other_prompt_fields_or_attributes_are_denied(self):
        for extra in (
            {"email": "changed@goauthentik.io"},
            {"attributes": {self.attribute: self.user.email, "other": "changed"}},
        ):
            with self.subTest(extra=extra):
                self.queue(self.user.email, **extra)
                self.execute(denied=True)
                self.user.refresh_from_db()
                self.assertEqual(self.user.attributes, {"unrelated": "old"})

    def test_missing_proof_clears_existing_key(self):
        self.queue(None, attributes={})
        User.objects.filter(pk=self.user.pk).update(
            attributes={self.attribute: self.user.email, "unrelated": "new"}
        )
        self.execute()
        self.user.refresh_from_db()
        self.assertEqual(self.user.attributes, {"unrelated": "new"})

    def test_repeat_does_not_emit_another_user_write(self):
        self.user.attributes[self.attribute] = self.user.email
        self.user.save()
        self.queue(self.user.email)
        with patch("authentik.stages.user_write.stage.user_write.send") as send:
            self.execute()
        send.assert_not_called()

    def test_serializer_rejects_creation_and_group_assignment(self):
        for data in (
            {"user_creation_mode": UserCreationMode.CREATE_WHEN_REQUIRED},
            {"create_users_group": Group.objects.create(name="unrelated-group").pk},
        ):
            with self.subTest(data=data):
                serializer = UserWriteStageSerializer(self.stage, data=data, partial=True)
                self.assertFalse(serializer.is_valid())
                self.assertIn("email_verification_attribute", serializer.errors)
