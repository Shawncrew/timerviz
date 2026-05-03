from django.contrib.auth.models import User
from django.db import models


class General(models.Model):
    """Permission container — no rows ever stored."""

    class Meta:
        managed = False
        default_permissions = ()
        permissions = (
            ("view_timerviz", "Can view timer visualization"),
            ("confirm_repair", "Can confirm structure timers as repaired"),
            ("configure_timerviz", "Can adjust timer visualization display settings"),
        )


class SystemPosition(models.Model):
    """Custom drag-positioned coordinates for a system node on the map."""

    system_name = models.CharField(max_length=100, unique=True, db_index=True)
    nx = models.FloatField()
    ny = models.FloatField()
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL)

    class Meta:
        default_permissions = ()

    def __str__(self):
        return f"{self.system_name} ({self.nx:.4f}, {self.ny:.4f})"


class TimerRepairState(models.Model):
    """Tracks user confirmation that a structure timer has finished repairing."""

    timer_id = models.IntegerField(unique=True, db_index=True)
    confirmed_at = models.DateTimeField(auto_now_add=True)
    confirmed_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL)

    class Meta:
        default_permissions = ()

    def __str__(self):
        return f"Repair confirmed for timer {self.timer_id}"
