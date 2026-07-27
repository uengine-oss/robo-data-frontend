<script setup lang="ts">
import UnavailableCapability from './UnavailableCapability.vue'
</script>

<template>
  <UnavailableCapability
    title="데이터 품질"
    description="테스트 케이스, 테스트 스위트, 품질 실행 결과를 제공할 서비스가 아직 연결되지 않았습니다."
    :capabilities="[
      '테스트 케이스와 테스트 스위트 조회·관리',
      '품질 검사 실행 결과와 실패 원인 조회',
      '데이터 자산별 품질 지표와 커버리지 집계',
    ]"
  />
</template>
