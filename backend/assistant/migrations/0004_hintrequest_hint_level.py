from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('assistant', '0003_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='hintrequest',
            name='hint_level',
            field=models.PositiveSmallIntegerField(default=1, verbose_name='Уровень подсказки'),
        ),
    ]
