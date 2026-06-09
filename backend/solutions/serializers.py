from rest_framework import serializers
from .models import Submission


class SubmitSerializer(serializers.Serializer):
    code = serializers.CharField()
    time_spent = serializers.IntegerField(default=0, min_value=0)


class SubmissionSerializer(serializers.ModelSerializer):
    task_title = serializers.CharField(source='task.title', read_only=True)

    class Meta:
        model = Submission
        fields = ('id', 'task', 'task_title', 'code', 'status',
                  'test_results', 'error_message', 'time_spent',
                  'used_hint', 'submitted_at')
