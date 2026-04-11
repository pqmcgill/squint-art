(module
  ;; Shared linear memory — imported so JS/Worker can write pixel data directly.
  ;; Layout:
  ;;   [0           .. len)       = rendered pixel data  (RGBA u8)
  ;;   [len         .. len*2)     = reference pixel data (RGBA u8)
  (memory (export "memory") 4 256)  ;; 4 initial pages (256 KiB), max 256 pages (16 MiB)

  ;; pixel_diff(len: i32) -> f64
  ;; len = number of BYTES in each pixel buffer (width * height * 4).
  ;; Returns the sum of squared per-channel (RGB) differences.
  (func (export "pixel_diff") (param $len i32) (result f64)
    (local $i   i32)
    (local $acc f64)
    (local $dr  i32)
    (local $dg  i32)
    (local $db  i32)

    (local.set $i   (i32.const 0))
    (local.set $acc (f64.const 0))

    (block $break
      (loop $loop
        ;; if i >= len, break
        (br_if $break (i32.ge_u (local.get $i) (local.get $len)))

        ;; dr = rendered[i] - reference[i]          (R channel)
        (local.set $dr
          (i32.sub
            (i32.load8_u (local.get $i))
            (i32.load8_u (i32.add (local.get $i) (local.get $len)))))

        ;; dg = rendered[i+1] - reference[i+1]      (G channel)
        (local.set $dg
          (i32.sub
            (i32.load8_u (i32.add (local.get $i) (i32.const 1)))
            (i32.load8_u (i32.add (i32.add (local.get $i) (local.get $len)) (i32.const 1)))))

        ;; db = rendered[i+2] - reference[i+2]      (B channel)
        (local.set $db
          (i32.sub
            (i32.load8_u (i32.add (local.get $i) (i32.const 2)))
            (i32.load8_u (i32.add (i32.add (local.get $i) (local.get $len)) (i32.const 2)))))

        ;; acc += dr*dr + dg*dg + db*db
        (local.set $acc
          (f64.add
            (local.get $acc)
            (f64.convert_i32_s
              (i32.add
                (i32.add
                  (i32.mul (local.get $dr) (local.get $dr))
                  (i32.mul (local.get $dg) (local.get $dg)))
                (i32.mul (local.get $db) (local.get $db))))))

        ;; i += 4  (next pixel)
        (local.set $i (i32.add (local.get $i) (i32.const 4)))
        (br $loop)))

    (local.get $acc)))
