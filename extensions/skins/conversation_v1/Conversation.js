// Copyright 2014 The Oppia Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS-IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview Controller for the conversation skin.
 *
 * @author sll@google.com (Sean Lip)
 */

// TODO(sll): delete/deprecate 'reset exploration' from the list of
// events sent to a container page.

oppia.directive('conversationSkin', [function() {
  return {
    restrict: 'E',
    scope: {},
    templateUrl: 'skins/Conversation',
    controller: [
        '$scope', '$timeout', '$rootScope', '$window', '$modal', 'warningsData',
        'messengerService', 'oppiaPlayerService', 'urlService', 'focusService',
        function(
          $scope, $timeout, $rootScope, $window, $modal, warningsData,
          messengerService, oppiaPlayerService, urlService, focusService) {

      var hasInteractedAtLeastOnce = false;
      var _answerIsBeingProcessed = false;

      $scope.isInPreviewMode = oppiaPlayerService.isInPreviewMode();

      $rootScope.loadingMessage = 'Loading';

      // If the exploration is iframed, send data to its parent about its height so
      // that the parent can be resized as necessary.
      $scope.lastRequestedHeight = 0;
      $scope.lastRequestedScroll = false;
      $scope.adjustPageHeight = function(scroll, callback) {
        $timeout(function() {
          var newHeight = document.body.scrollHeight;
          if (Math.abs($scope.lastRequestedHeight - newHeight) > 50.5 ||
              (scroll && !$scope.lastRequestedScroll)) {
            // Sometimes setting iframe height to the exact content height still
            // produces scrollbar, so adding 50 extra px.
            newHeight += 50;
            messengerService.sendMessage(messengerService.HEIGHT_CHANGE,
              {height: newHeight, scroll: scroll});
            $scope.lastRequestedHeight = newHeight;
            $scope.lastRequestedScroll = scroll;
          }

          if (callback) {
            callback();
          }
        }, 100);
      };

      $window.addEventListener('beforeunload', function(e) {
        if (hasInteractedAtLeastOnce && !$scope.finished &&
            !$scope.isInPreviewMode) {
          oppiaPlayerService.registerMaybeLeaveEvent();
          var confirmationMessage = (
            'If you navigate away from this page, your progress on the ' +
            'exploration will be lost.');
          (e || $window.event).returnValue = confirmationMessage;
          return confirmationMessage;
        }
      });

      $scope.openCardFeedbackModal = function(stateName) {
        if ($scope.isInPreviewMode) {
          warningsData.addWarning('This functionality is not available in preview mode.');
        } else {
          oppiaPlayerService.openPlayerFeedbackModal(stateName);
        }
      };

      var _scrollToBottom = function(postScrollCallback) {
        $scope.adjustPageHeight(true, function() {
          $('html, body, iframe').animate({
            'scrollTop': $('.conversation-skin-oppia:last').offset().top - $(window).height() * 0.5
          }, 1000, 'easeOutQuad').promise().done(postScrollCallback);
        });
      };

      var _addNewCard = function(stateName, contentHtml) {
        $scope.allResponseStates.push({
          stateName: stateName,
          content: contentHtml,
          answerFeedbackPairs: []
        });
      };

      $scope.initializePage = function() {
        $scope.allResponseStates = [];
        $scope.inputTemplate = '';
        $scope.interactionIsInline = false;
        $scope.waitingForOppiaFeedback = false;
        $scope.waitingForNewCard = false;

        oppiaPlayerService.init(function(stateName, initHtml, hasEditingRights) {
          $scope.explorationId = oppiaPlayerService.getExplorationId();
          $scope.explorationTitle = oppiaPlayerService.getExplorationTitle();
          oppiaPlayerService.getUserProfileImage().then(function(result) {
            // $scope.profilePicture contains a dataURI representation of the
            // user-uploaded profile image, or the path to the default image.
            $scope.profilePicture = result;
          });
          hasInteractedAtLeastOnce = false;
          $scope.finished = false;
          $scope.hasEditingRights = hasEditingRights;
          messengerService.sendMessage(
            messengerService.EXPLORATION_LOADED, null);

          $scope.stateName = stateName;
          $scope.inputTemplate = oppiaPlayerService.getInteractionHtml(stateName);
          $scope.interactionIsInline = oppiaPlayerService.isInteractionInline(stateName);

          // This $timeout prevents a 'flash of unstyled content' when the preview tab is loaded from
          // the editor tab.
          $timeout(function() {
            $rootScope.loadingMessage = '';
          }, 500);

          $scope.adjustPageHeight(false, null);
          $window.scrollTo(0, 0);

          $scope.waitingForNewCard = true;

          $timeout(function() {
            _addNewCard($scope.stateName, initHtml);
            $scope.waitingForNewCard = false;
            _scrollToBottom(function() {});
          }, 1000);
        });
      };

      $scope.initializePage();

      $scope.submitAnswer = function(answer, handler) {
        // For some reason, answers are getting submitted twice when the submit
        // button is clicked. This guards against that.
        if (_answerIsBeingProcessed) {
          return;
        }
        _answerIsBeingProcessed = true;
        hasInteractedAtLeastOnce = true;

        $scope.allResponseStates[$scope.allResponseStates.length - 1].answerFeedbackPairs.push({
          learnerAnswer: oppiaPlayerService.getAnswerAsHtml(answer),
          oppiaFeedback: ''
        });

        $scope.waitingForOppiaFeedback = true;

        oppiaPlayerService.submitAnswer(answer, handler, function(
            newStateName, refreshInteraction, feedbackHtml, questionHtml, newInteractionId) {
          $timeout(function() {
            var oldStateName = $scope.stateName;
            $scope.stateName = newStateName;

            $scope.finished = oppiaPlayerService.isStateTerminal(newStateName);
            if ($scope.finished) {
              messengerService.sendMessage(
                messengerService.EXPLORATION_COMPLETED, null);
            }

            if (newStateName && refreshInteraction) {
              // The previous interaction should be replaced.
              $scope.inputTemplate = oppiaPlayerService.getInteractionHtml(
                newStateName) + oppiaPlayerService.getRandomSuffix();
              $scope.interactionIsInline = oppiaPlayerService.isInteractionInline(
                newStateName);
            }

            var pairs = $scope.allResponseStates[$scope.allResponseStates.length - 1].answerFeedbackPairs;
            pairs[pairs.length - 1].oppiaFeedback = feedbackHtml;

            if (oldStateName === newStateName) {
              $scope.waitingForOppiaFeedback = false;
              _scrollToBottom(function() {
                _answerIsBeingProcessed = false;
              });
            } else {
              if (feedbackHtml) {
                $scope.waitingForOppiaFeedback = false;
                $scope.waitingForNewCard = true;
                _scrollToBottom(function() {
                  $timeout(function() {
                    $scope.waitingForNewCard = false;
                    _addNewCard($scope.stateName, questionHtml);
                    _scrollToBottom(function() {
                      _answerIsBeingProcessed = false;
                    });
                  }, 1000);
                });
              } else {
                $scope.waitingForOppiaFeedback = false;
                _addNewCard($scope.stateName, questionHtml);
                _scrollToBottom(function() {
                  _answerIsBeingProcessed = false;
                });
              }
            }
          }, 1000);
        });
      };

      $window.onresize = function() {
        $scope.adjustPageHeight(false, null);
      };
    }]
  };
}]);
