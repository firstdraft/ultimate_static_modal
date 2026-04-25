# frozen_string_literal: true

require "rails/generators"

module UltimateStaticModal
  module Generators
    class InstallGenerator < Rails::Generators::Base
      source_root File.expand_path("templates", __dir__)

      desc "Installs UltimateStaticModal: copies Stimulus controllers (static_modal + forked modal) and wires them into controllers/index.js."

      def copy_static_modal_controller
        copy_file "static_modal_controller.js",
          "app/javascript/controllers/static_modal_controller.js"
      end

      def copy_forked_modal_controller
        copy_file "modal_controller.js",
          "app/javascript/controllers/modal_controller.js"
      end

      def update_controllers_index
        index_path = Rails.root.join("app", "javascript", "controllers", "index.js")

        unless File.exist?(index_path)
          say_manual_snippet(index_path)
          return
        end

        content = File.read(index_path)

        # Add static-modal import + registration
        static_import = "import StaticModalController from \"./static_modal_controller\"\n"
        static_register = "application.register(\"static-modal\", StaticModalController)\n"

        if content.include?("StaticModalController")
          say "⏩ static-modal controller already registered.", :blue
        else
          if content.match?(/import .* from ["'](?:@hotwired\/stimulus|\.\/application)["']\n/)
            insert_into_file index_path.to_s, static_import,
              after: /import .* from ["'](?:@hotwired\/stimulus|\.\/application)["']\n/
          else
            prepend_to_file index_path.to_s, static_import
          end
          append_to_file index_path.to_s, static_register
          say "✅ Registered `static-modal` Stimulus controller.", :green
        end

        # Re-read after static-modal insert
        content = File.read(index_path)

        # Swap UTMR's modal registration for our forked controller
        utmr_pattern = /import\s*\{\s*UltimateTurboModalController\s*\}\s*from\s*["']ultimate_turbo_modal["']\s*\n\s*application\.register\(\s*["']modal["']\s*,\s*UltimateTurboModalController\s*\)\s*\n/

        fork_block = <<~JS
          import ModalController from "./modal_controller"
          // Side-effect import: turbo:frame-missing / before-frame-render / before-cache handlers
          import "ultimate_turbo_modal"
          application.register("modal", ModalController)
        JS

        if content.include?('import ModalController from "./modal_controller"')
          say "⏩ Forked modal controller already registered.", :blue
        elsif content.match?(utmr_pattern)
          gsub_file index_path.to_s, utmr_pattern, fork_block
          say "✅ Swapped UTMR modal registration for the forked null-safe controller (UTMR npm package still imported for side-effects).", :green
        else
          say "⚠️  Could not find UTMR's modal registration to swap.", :yellow
          say "   Add these lines to controllers/index.js manually, replacing any existing UTMR modal registration:", :yellow
          fork_block.each_line { |line| say "   #{line.rstrip}", :cyan }
        end
      end

      def show_readme
        say "\nUltimateStaticModal installation complete!", :magenta
        say "Rebuild your JS bundle and restart Rails.", :yellow
      end

      private

      def say_manual_snippet(index_path)
        say "\n❌ Could not find #{index_path}.", :red
        say "   Register the controllers manually in your Stimulus setup.", :yellow
      end
    end
  end
end
