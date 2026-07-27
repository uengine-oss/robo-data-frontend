<script setup lang="ts">
import UnavailableCapability from './UnavailableCapability.vue'
</script>

<template>
  <UnavailableCapability
    title="인시던트 관리"
    description="인시던트의 생성, 상태 변경, 담당자와 활동 기록을 제공할 서비스가 아직 연결되지 않았습니다."
    :capabilities="[
      '인시던트 목록과 상세 이력 조회',
      '상태, 심각도, 담당자 변경',
      '데이터 품질·이벤트 알림과 인시던트 연결',
    ]"
  />
</template>
