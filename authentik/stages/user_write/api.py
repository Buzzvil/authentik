"""User Write Stage API Views"""

from rest_framework.serializers import ValidationError
from rest_framework.viewsets import ModelViewSet

from authentik.core.api.used_by import UsedByMixin
from authentik.flows.api.stages import StageSerializer
from authentik.stages.user_write.models import UserCreationMode, UserWriteStage


class UserWriteStageSerializer(StageSerializer):
    """UserWriteStage Serializer"""

    def validate(self, attrs):
        attrs = super().validate(attrs)
        attribute = attrs.get(
            "email_verification_attribute",
            getattr(self.instance, "email_verification_attribute", ""),
        )
        if attribute and (
            attrs.get("user_creation_mode", getattr(self.instance, "user_creation_mode", None))
            != UserCreationMode.NEVER_CREATE
            or attrs.get("create_users_group", getattr(self.instance, "create_users_group", None))
            is not None
        ):
            raise ValidationError(
                {"email_verification_attribute": "Requires never_create and no group assignment."}
            )
        return attrs

    class Meta:
        model = UserWriteStage
        fields = StageSerializer.Meta.fields + [
            "user_creation_mode",
            "create_users_as_inactive",
            "create_users_group",
            "user_type",
            "user_path_template",
            "email_verification_attribute",
        ]


class UserWriteStageViewSet(UsedByMixin, ModelViewSet):
    """UserWriteStage Viewset"""

    queryset = UserWriteStage.objects.all()
    serializer_class = UserWriteStageSerializer
    filterset_fields = "__all__"
    search_fields = ["name"]
    ordering = ["name"]
