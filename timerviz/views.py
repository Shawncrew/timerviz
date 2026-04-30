from django.conf import settings
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin
from django.db import models
from django.http import JsonResponse
from django.utils import timezone
from django.views import View
from django.views.generic import TemplateView

from allianceauth.timerboard.models import Timer

from .models import TimerRepairState


def _upcoming_window_min():
    return getattr(settings, "TIMERVIZ_UPCOMING_WINDOW_MIN", 60)


def _repair_window_min():
    return getattr(settings, "TIMERVIZ_REPAIR_WINDOW_MIN", 15)


class TimervizView(LoginRequiredMixin, PermissionRequiredMixin, TemplateView):
    template_name = "timerviz/view.html"
    permission_required = "timerviz.view_timerviz"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["upcoming_window_min"] = _upcoming_window_min()
        ctx["repair_window_min"] = _repair_window_min()
        ctx["can_confirm"] = self.request.user.has_perm("timerviz.confirm_repair")
        ctx["can_configure"] = self.request.user.has_perm("timerviz.configure_timerviz")
        return ctx


class TimerDataView(LoginRequiredMixin, PermissionRequiredMixin, View):
    permission_required = "timerviz.view_timerviz"

    def get(self, request):
        now = timezone.now()

        confirmed_ids = set(
            TimerRepairState.objects.values_list("timer_id", flat=True)
        )

        qs = Timer.objects.filter(eve_time__gte=now - timezone.timedelta(hours=24))

        # Respect timerboard corp_timer visibility unless user has timer_management
        if not request.user.has_perm("auth.timer_management"):
            try:
                user_corp = request.user.profile.main_character.corporation_id
                qs = qs.filter(
                    models.Q(corp_timer=False)
                    | models.Q(eve_corp__corporation_id=user_corp)
                )
            except Exception:
                qs = qs.filter(corp_timer=False)

        timers = []
        for t in qs.order_by("eve_time"):
            timers.append(
                {
                    "id": t.pk,
                    "eve_time": t.eve_time.isoformat(),
                    "system": t.system,
                    "planet_moon": t.planet_moon,
                    "structure": t.structure,
                    "objective": t.objective,
                    "timer_type": t.timer_type,
                    "details": t.details,
                    "important": t.important,
                    "confirmed": t.pk in confirmed_ids,
                }
            )

        return JsonResponse(
            {
                "timers": timers,
                "upcoming_window_min": _upcoming_window_min(),
                "repair_window_min": _repair_window_min(),
                "can_confirm": request.user.has_perm("timerviz.confirm_repair"),
                "can_configure": request.user.has_perm("timerviz.configure_timerviz"),
                "server_time": now.isoformat(),
            }
        )


class ConfirmRepairView(LoginRequiredMixin, PermissionRequiredMixin, View):
    permission_required = "timerviz.confirm_repair"

    def post(self, request, timer_id):
        try:
            Timer.objects.get(pk=timer_id)
        except Timer.DoesNotExist:
            return JsonResponse({"error": "Timer not found"}, status=404)

        obj, created = TimerRepairState.objects.get_or_create(
            timer_id=timer_id,
            defaults={"confirmed_by": request.user},
        )
        return JsonResponse({"ok": True, "created": created, "timer_id": timer_id})
