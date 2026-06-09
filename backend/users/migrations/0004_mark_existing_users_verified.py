from django.db import migrations


def mark_verified(apps, schema_editor):
    User = apps.get_model('users', 'User')
    User.objects.update(email_verified=True)


def unmark_verified(apps, schema_editor):
    User = apps.get_model('users', 'User')
    User.objects.update(email_verified=False)


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0003_user_email_verified_emailverificationtoken'),
    ]

    operations = [
        migrations.RunPython(mark_verified, reverse_code=unmark_verified),
    ]
