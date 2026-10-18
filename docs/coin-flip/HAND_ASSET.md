# 손 에셋

- 결과: `src/coin/assets/divine-hand.png` (2172×724 RGBA, 724×724 세 자세).
- 도구: 내장 `image_gen` 편집, 투명 배경. 사용자 승인 3컷 시안이 참조 이미지다.
- 순서: 준비 / 접촉 / 후속 자세. 동일 손목 위치와 크기를 공유한다.
- 접촉 자세의 중지 끝 등록점: 셀 왼쪽 위에서 `(0.30, 0.89)`. 게임에서는 이 점을 상한의 코인 윗부분에 배치한다.
- 게임 코드가 위치·투명도·자세 전환·섬광·입자를 제어한다. 매 충돌에 새 이미지나 손 개체를 생성하지 않는다.

최종 생성 프롬프트:

> Create a production game sprite atlas based faithfully on the approved divine hand in the reference storyboard. ONLY the hand and wrist, no coin, no stars, no lettering, no background, no borders, no contact rings. Actual transparent background. One wide image divided into EXACTLY THREE equal-width square cells left to right, each cell contains the SAME realistic sculpted ivory right hand with translucent warm champagne-gold edge glow, same anatomy, same scale, same orientation, same wrist position. Reference is style/pose guide. Hand/wrist comes diagonally from top-right, fingers towards bottom-left. Anatomically correct five fingers. Cell 1: anticipation, thumb holding curled middle fingertip for a downward finger flick (딱밤), index points loosely left, ring/little fingers folded. Cell 2: released middle finger extended down-left, fingertip pointing downward, like reference center panel, thumb released. Cell 3: follow-through, middle finger slightly relaxed down, other fingers same as before. IMPORTANT registration: hand wrist enters all cells at x=95%, y=10%; palm centered x=65%, y=38%; in cell 2 the active middle fingertip is EXACTLY x=30%, y=82% of its cell; cell 1 middle fingertip bent back at x=51%,y=57%; cell 3 fingertip x=32%,y=74%. Keep complete fingertip inside each cell, keep hands inside own cell, no overlap between cells. The hand should have beautifully rendered knuckles, nails, smooth joint shapes and luminous soft internal ivory translucency, physically shaded like the original approved image, sufficiently opaque to read over black space, transparent outside hand silhouette. No star particles floating outside the hand, no vignette, no cast shadow, no labels or other objects. This is one animated sprite sheet asset with three registered poses, not a storyboard with scenery.

생성 요청의 y=0.82 대신 출력 이미지에서 확인한 y=0.89를 실제 등록점으로 사용했다.
