from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="General",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ],
            options={
                "managed": False,
                "default_permissions": (),
                "permissions": (
                    ("view_timerviz", "Can view timer visualization"),
                    ("confirm_repair", "Can confirm structure timers as repaired"),
                    ("configure_timerviz", "Can adjust timer visualization display settings"),
                ),
            },
        ),
        migrations.CreateModel(
            name="TimerRepairState",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("timer_id", models.IntegerField(db_index=True, unique=True)),
                ("confirmed_at", models.DateTimeField(auto_now_add=True)),
                (
                    "confirmed_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "default_permissions": (),
            },
        ),
    ]
